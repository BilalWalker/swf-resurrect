# Requirements Document

## Introduction

Every sample so far is a test file. The product claim is "give it a Flash `.swf`, get a project that runs". This spec makes the claim true for two real AS3 games, which become the centre of the demo:

| Sample | Game | Role | Licence | Local SWF (already on disk) |
|---|---|---|---|---|
| `entity_game` | EntityAsteroids by Iain Lobb, code-drawn vector game | First milestone | MIT | `.work/games/entity/test.swf` |
| `spacer` | Spacer by Zabuzard, timeline FLA game | Headline | GPL-3.0 | `.work/games/spacer/test.swf` |

Juicy Breakout is out of scope.

Neither game plays today. The decompiled-source analysis `.work/gaps/as3-coverage-analysis.md` (input, not truth) lists the Flash APIs the Shim lacks, the mistranslated constructs and the reasons the games fail at load. This spec turns that list into work in four blocks, each ending in a Checkpoint:

- **Block A, shared:** `Stage` as a type import, nullable class types, `KeyboardEvent` and keyboard wiring, the 5-argument `addEventListener`, the Stage as the real top of the display tree, and a project that loads without an import-time error (Requirement 37). Checkpoint 1.
- **Block B, `entity_game` plays:** inherited-member name resolution, `Vector.<T>(array)`, `Signal`, `Graphics` on `Sprite`, `Keyboard` constants, `Stage.focus`, a minimal `TextField`, stored `filters`. Checkpoint 2: the game is playable.
- **Block C, `spacer` plays:** `KeyObject`, `this.field` in `super(...)` arguments, `MovieClip.currentLabel`, scenes, Stage children and members, `Timer`, `TimerEvent`, `getTimer`, collision. Checkpoint 3: the game is playable.
- **Block D, looks right (only if budget remains):** the 13 `DefineEditText` texts of `spacer`, drawn as shapes through the existing text path, and rotated `width` and `height`. Checkpoint 4, final.

### Decisions already taken

1. Hand-written replacements are allowed for exactly two classes, through the existing `handwritten/<sample>/` mechanism: `KeyObject` and `PhysicEngine` of `spacer` (the second calling one runtime helper for pixel overlap). `org.osflash.signals.Signal` of `entity_game` takes the translator route, because the rules it needs (Requirements 11, 12 and 13) are required anyway. Everything else comes from the deterministic translator. Fallback: if the translator route for `Signal` fails, the Handwritten_Set may grow to include it, and only together with the packaged-override fix of Requirement 18.
2. Every hand-written class is named as hand-written, with its reason, in the translation report and the fidelity report.
3. A translator, Shim or runtime change is a rule that is right for AS3 in general, with tests that do not mention either game. No special case is keyed on a class or sample name outside `handwritten/`.
4. The sample names are `entity_game` and `spacer`. The words "Asteroids" and "Breakout" do not appear in sample folder names, report display names or UI strings (third-party trademarks). Class and package names inside converted code stay as they are.
5. `entity_game` is MIT and its SWF is committed under `samples/entity_game/`. `spacer` is GPL-3.0: its SWF and its converted output are not committed, and it is a fetched sample like `static_text`. The licence under which the hand-written `spacer` files are committed, and the upstream URLs and commits of both games, are owner decisions that are pending (Open_Items, Requirement 28).

### Facts checked while writing this spec

Checked with the `swf-inspector` tools on `.work/games/entity/test.swf` and `.work/games/spacer/test.swf` (inside the repository, so no copy is needed):

- `spacer.swf`: SWF version 25, 2 root frames at 60 fps, stage 800 x 700, AS3, SymbolClass present, 24 ABC classes, 13 `DefineEditTextTag`, 1 `DefineSceneAndFrameLabelDataTag`, 2 `DefineBitsTag`, 30 `FrameLabelTag`. This agrees with the analysis.
- `entity_game.swf`: SWF version 10, 1 root frame at **30 fps**, stage 800 x 600, AS3, SymbolClass present, 23 ABC classes, and no shape, text, bitmap or sound tag. The analysis does not state the frame rate; the timing of `Timer` and `getTimer` tests uses the real rate of each SWF.
- Analysis correction: the 13 `DefineEditText` texts of `spacer` are called "dynamic text" in the analysis. FFDec reports all 13 with `wasStatic="true"` and `readOnly="true"`: they are static text that FFDec exports as edit-text tags. No script refers to them by name, so the work for Block D is rendering, not a `TextField` API.
- Analysis claims not yet verified by this spec and therefore treated as open until a task measures them: the Stage `enterFrame` order, the class-omission chains, the cause of the `spacer` render timeout, and every line number of the decompiled AS3.

## Glossary

- **SWF_Resurrect**: The tool of this repository.
- **Pipeline**: The command (`npm run pipeline`) that runs Unpack, Convert, Translate and Emit, and the Verify_Stage with `--verify`.
- **Translator**: The deterministic AS3-to-TypeScript stage of the Pipeline (`src/translate/`).
- **Shim**: The small Flash API layer in `template/shim/` copied into every Emitted_Project.
- **Shim_Member_Table**: The generated file `src/translate/shimMembers.generated.ts` (`npm run gen:shim-members`) that the Translator uses to resolve bare identifiers to Shim members.
- **Runtime**: The timeline player and PixiJS backend in `template/runtime/`.
- **Player**: The Runtime object that owns the clock, the display tree and input dispatch (`template/runtime/player.ts`).
- **Stage_Object**: The Shim `Stage`, the parent of the root clip.
- **Stage_Child**: A display object whose parent is the Stage_Object and which is not the root clip.
- **Emitted_Project**: The Vite + TypeScript + PixiJS project written by Emit.
- **Scene_JSON**: The per-project scene description written by Convert (`formatVersion` 2 today; this spec raises it to 3 for scenes, and the reader accepts 2 and 3).
- **Shape_JSON**: The per-symbol shape description that the Runtime draws.
- **Named_Limit**: An entry of the Unsupported_Feature_List or of `visual.knownVisualLimits` that names a feature that is not drawn, not translated or only approximated.
- **Unsupported_Feature_List**: `unsupported-features.json` next to the Emitted_Project.
- **Translation_Report**: `translation-report.json` next to the Emitted_Project.
- **Fidelity_Report**: `fidelity-report.json` (and its HTML form) written by the Verify_Stage.
- **Verify_Stage**: The Pipeline stage that compares the Emitted_Project with the original (`src/verify/`).
- **Reference_Frame**: A PNG that FFDec renders for one frame of the original SWF.
- **Overall_Match**: The mean `matchPercent` over the compared frames, as defined by the verify spec.
- **Trace_Score**: `100 * matched / max(referenceLineCount, capturedLineCount)`, as defined by the verify spec.
- **Reference_Trace**: `samples/<name>/reference/output.txt`, the Ruffle `trace()` log of the original.
- **Reference_Input**: `samples/<name>/reference/input.json`, the Ruffle input script.
- **Replay**: Running the Reference_Input against the Emitted_Project's translated classes, as defined by the verify spec.
- **Input_Script**: A Reference_Input extended by this spec with keyboard entries.
- **Key_Entry**: An Input_Script entry of type `KeyDown` or `KeyUp` with a key code and a tick.
- **Fixture_Class**: A hand-made AS3 class used by a test of the Translator or Shim, independent of any sample.
- **Fetched_Sample**: A sample whose SWF is downloaded or copied into `.work/` by a script and never committed (`static_text` today, `spacer` after this spec).
- **Hand_Written_Class**: A class that `handwritten/<sample>/` supplies in place of a translated class.
- **Handwritten_Set**: The two Hand_Written_Classes allowed by this spec: `KeyObject` (`spacer`) and `PhysicEngine` (`spacer`), listed in `handwritten/SET.json`. `org.osflash.signals.Signal` (`entity_game`) is translated and joins the set only through the fallback of Requirement 18.
- **Import_Cycle_Hazard**: A translated class `C` with translated base class `S` such that `S` reaches `C` through value imports, which makes the base undefined when the module is evaluated.
- **Load_Error_Report**: The value `window.__swfResurrect.error` that the emitted page sets when a module fails to load or an unhandled rejection occurs before `main.ts` runs.
- **Broadcast_Event**: One of `ENTER_FRAME`, `FRAME_CONSTRUCTED` and `EXIT_FRAME`, which the Player delivers to every registered listener and not along the display list.
- **Play_Test**: The headless end-to-end test of one game that sends an Input_Script to the Emitted_Project and asserts observable state (Requirements 24 and 25).
- **Score_Floor**: The committed lowest acceptable Overall_Match or Trace_Score of a sample. Floors only go up.
- **Shared_Run_Cache**: The existing cache that lets e2e tests reuse one Pipeline run per sample.
- **Browser_Limit**: The existing limit of 3 concurrent headless Chromium instances.
- **Warm_Suite_Time**: The wall-clock time of `npm test -- --run` with the Shared_Run_Cache warm.
- **Checkpoint**: A task named "Checkpoint" in `tasks.md`.
- **Fidelity_Reviewer**: The read-only custom agent `fidelity-reviewer`.
- **Checkpoint_Report**: The message that stops the work at a Checkpoint (Requirement 34).
- **Static_Text_Tag**: A `DefineEditTextTag` that FFDec reports with `wasStatic="true"` and `readOnly="true"`.
- **Block_D_Budget**: The 60-credit share of Block D (Requirement 36.3).
- **Rotated_Bounds**: The axis-aligned bounding box, in the parent's coordinate space, of the content of a display object after its rotation, scale and skew are applied.
- **Credits_Line**: The "Est. Credits Used" line of a Checkpoint_Report.
- **Ruffle_Source**: The Ruffle repository at commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`, the pin used by `.kiro/steering/flash-behaviour.md`.
- **Open_Item**: A behaviour that is neither measured nor read in the Ruffle_Source, recorded in the design with the reason.

## Requirements

### Requirement 1: Repository hygiene test passes (already satisfied)

**User Story:** As a maintainer, I want the hygiene test and the full suite green before Block A starts, so that later failures are known to come from new work.

This requirement records a starting condition that is already met on `wip/as3-coverage`. It needs no new work, and Block A starts from it.

- Commit `2cf644a` added `@ruffle-rs/ruffle` to the known dependency list of `test/unit/repoHygiene.test.ts` with a comment that names the web UI as the user, and changed the token scan to read each tracked text file once. The scan takes 66 ms where it took 15.5 s.
- Commit `f1db0d0` fixed a read/exists race on the slot pid file in `test/support/slots.ts` that the full suite exposed after the first fix. It is a one-line change.

#### Acceptance Criteria

1. THE repository hygiene test (`test/unit/repoHygiene.test.ts`) SHALL pass, and its known dependency list SHALL contain `@ruffle-rs/ruffle`.
2. THE hygiene test for token-like strings SHALL complete in less than half of its timeout, and no test timeout SHALL be raised by this spec.
3. THE full suite (`npm test -- --run`) SHALL pass before the first task of Block A starts.
4. THE `test/support/slots.ts` pid-file read SHALL tolerate a file that disappears between the existence check and the read.
5. THE test `test/web/publicHost.e2e.test.ts` (rate-limit case) failed once under full-suite load after 13.8 s, and passed when run alone and in later full runs; THIS spec SHALL record that failure as an Open_Item in the design and SHALL NOT change that test or its timeout.
6. IF that test fails again under full-suite load during this spec, THEN THE implementer SHALL report the failure and its duration in the Checkpoint_Report and SHALL NOT treat it as caused by the change of the current task without rerunning it alone.

### Requirement 2: Stage and Shim classes are imported when used only as types

**User Story:** As a developer of a converted project, I want a Shim class named only in a type position to be imported, so that translated code does not fail with "cannot find name".

#### Acceptance Criteria

1. WHEN a translated class names a Shim class only in a type annotation, THE Translator SHALL add the import of that Shim class.
2. WHEN a translated class names a Shim class in a type annotation and in an expression, THE Translator SHALL emit one import of that class.
3. THE Translator SHALL treat every class exported by the Shim as importable by this rule, including `Stage`.
4. FOR ALL Fixture_Classes that mention a Shim class name in a type position, the emitted TypeScript SHALL contain exactly one import of that name (property test).
5. THE tests of this requirement SHALL use Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 3: AS3 class types accept null

**User Story:** As a developer of a converted project, I want a variable of an AS3 class type to accept `null`, so that valid AS3 does not fail the type-check gate or class load.

#### Acceptance Criteria

1. THE Translator SHALL emit every AS3 reference type (a class, an interface, `Object`, `Array`, `Function`, `String`) as a type that admits `null` in a variable, field, parameter and return position.
2. THE Translator SHALL NOT widen `int`, `uint`, `Number` or `Boolean` to admit `null`.
3. WHEN a class has no type error other than null assignment under the previous emission, THE type-check gate SHALL report no error for that class after the change.
4. WHEN a translated class was left out of the registry only because of a null-assignment type error, THE Translator SHALL keep that class in the registry.
5. FOR ALL generated AS3 type annotations drawn from the primitive set and the reference set, THE emitted TypeScript type SHALL admit `null` if and only if the AS3 type is a reference type (property test).
6. THE existing golden translations SHALL change only where a reference type gains `| null`, and the commit SHALL record each regenerated golden and why.
7. THE tests of this requirement SHALL use Fixture_Classes and SHALL NOT mention a sample name.
8. THE emitted `tsconfig.json` and the options of the type-check gate SHALL set `strictNullChecks` to false and SHALL keep every other `strict` flag on, because AS3 reference types are nullable and a dereference of a `T | null` value would otherwise raise TS18047 on every use.
9. THE annotation text emitted under Acceptance Criterion 1 SHALL stay `T | null` whatever the value of `strictNullChecks`.

### Requirement 4: KeyboardEvent and Keyboard constants in the Shim

**User Story:** As a developer of a converted project, I want `KeyboardEvent` and `Keyboard` in the Shim, so that key handlers bind to Flash types and not to the browser's `KeyboardEvent`.

#### Acceptance Criteria

1. THE Shim SHALL export a `KeyboardEvent` class that extends the Shim `Event` with `KEY_DOWN` equal to `"keyDown"`, `KEY_UP` equal to `"keyUp"`, and a numeric `keyCode`.
2. THE Shim SHALL export a `Keyboard` class with the key-code constants used by the two games: `UP` 38, `DOWN` 40, `LEFT` 37, `RIGHT` 39, `ENTER` 13, `ESCAPE` 27, `SPACE` 32.
3. THE Translator SHALL resolve the name `KeyboardEvent` to the Shim class and SHALL NOT bind it to the DOM global of the same name.
4. THE Shim_Member_Table SHALL be regenerated with the Shim change and committed with it.
5. WHERE a Shim addition goes beyond `docs/brief.md`, THE addition SHALL be listed in `template/shim/ADDED_APIS.md` with the Fixture_Class line that needs it.
6. THE constant values SHALL be read from the Ruffle_Source or from the Flash documentation of `flash.ui.Keyboard`, and the design SHALL name which.

### Requirement 5: Keyboard wiring from the browser to the Stage

**User Story:** As a player of a converted game, I want my key presses to reach the game, so that I can control it.

#### Acceptance Criteria

1. WHEN the browser sends `keydown` for a key while the Emitted_Project has input focus, THE Player SHALL dispatch a `KeyboardEvent` of type `KEY_DOWN` carrying the Flash key code of that key.
2. WHEN the browser sends `keyup`, THE Player SHALL dispatch a `KeyboardEvent` of type `KEY_UP` with the same key code rule.
3. WHILE `Stage.focus` is a display object on the display list, THE Player SHALL dispatch the key event at that object, with bubbling to the Stage_Object.
4. WHILE `Stage.focus` is null, THE Player SHALL dispatch the key event at the Stage_Object.
5. WHEN the key code is one of the arrow keys or the space bar, THE Emitted_Project SHALL call `preventDefault` on the browser event.
6. WHEN the browser repeats `keydown` for a held key, THE Player SHALL dispatch each repeat as a further `KEY_DOWN`.
7. WHEN the Emitted_Project runs inside the side-by-side iframe of the web UI, THE Emitted_Project SHALL receive key events after the user clicks the frame.
8. THE mapping from browser key to Flash key code SHALL cover every key code the two games read (13, 27, 32, 37, 38, 39, 40, 65, 67, 68, 83, 87, 88, 90) and SHALL be a pure function with a test per code.
9. THE tests of the Player's key dispatch SHALL run with the FakeBackend and a manual clock, without a browser.
10. THE claim "browser key codes equal Flash key codes for these keys" SHALL be verified by measurement in headless Chromium or recorded as an Open_Item.

### Requirement 6: Five-argument addEventListener

**User Story:** As a developer of a converted project, I want `addEventListener` to accept the full AS3 signature, so that valid AS3 calls type-check.

#### Acceptance Criteria

1. THE Shim `EventDispatcher.addEventListener` SHALL accept `type`, `listener`, `useCapture`, `priority` and `useWeakReference`, with the last three optional.
2. THE Shim `EventDispatcher.removeEventListener` SHALL accept `type`, `listener` and optional `useCapture`.
3. WHEN two listeners with different `priority` values are added to one dispatcher for one event type, THE Shim SHALL call the listener with the higher `priority` first, and SHALL call listeners with equal `priority` in the order of addition.
4. THE Shim SHALL treat `useCapture` as false and `useWeakReference` as false and SHALL record both as Named_Limits in `template/shim/ADDED_APIS.md`.
5. FOR ALL sequences of `addEventListener` calls with random priorities, THE dispatch order SHALL be sorted by descending priority and stable within equal priority (property test).
6. THE Ruffle_Source SHALL be read for the ordering of equal priorities, and the design SHALL record the result.

### Requirement 7: The Stage is the top of the display tree

**User Story:** As a developer of a converted project, I want children added to the Stage to behave like any other display object, so that games that build their scene on the Stage work.

#### Acceptance Criteria

1. THE Stage_Object SHALL be a display object container whose child at index 0 is the root clip.
2. WHEN a script calls `Stage.addChild` or `Stage.removeChild`, THE Shim SHALL add or remove the child after the root clip in draw order, and SHALL dispatch `ADDED`, `ADDED_TO_STAGE`, `REMOVED` and `REMOVED_FROM_STAGE` as for any container.
3. IF a script calls `Stage.removeChild` with an object that is not a child of the Stage_Object, THEN THE Shim SHALL throw an `ArgumentError`.
4. THE Player SHALL draw every Stage_Child above the root clip in the order of its index.
5. THE Player SHALL advance the timeline of every Stage_Child in the same phases as for clips under the root, with children before their parent, and SHALL deliver each Broadcast_Event to the listeners of the Stage_Child and of the clips under the root once per frame step, in the order of the first registration of each listener (Acceptance Criterion 9).
6. THE Player SHALL hit-test Stage_Children and SHALL give a pointer event at a point to the topmost Hit_Target among the Stage_Children and the root subtree, following the rule of `.kiro/steering/flash-behaviour.md`.
7. WHEN a linked-class symbol is instantiated by script and added to the Stage_Object, THE Runtime SHALL bind its named children before the class constructor body runs, as for symbols placed by the timeline.
8. THE Player SHALL dispatch `ENTER_FRAME` to the Stage_Object once per tick.
9. THE Player SHALL deliver each Broadcast_Event in the order in which the listening objects first registered a listener for that event type, for any display object and for the Stage_Object, whether or not the object is on the display list (read in the Ruffle_Source: `register_broadcast_listener` and `broadcast_event`), and the design SHALL record the file names.
10. IF the registration-order rule lowers the Overall_Match or Trace_Score of an existing sample, THEN THE Player SHALL keep post-order delivery for objects under the root and SHALL apply registration order among the Stage_Object and the Stage_Children, and the Checkpoint_Report SHALL name the fallback.
11. THE existing samples SHALL keep their Overall_Match and Trace_Score, and the Checkpoint_Report SHALL list them.

### Requirement 8: Stage members

**User Story:** As a developer of a converted project, I want the Stage members that the games read and write, so that those statements run.

#### Acceptance Criteria

1. THE Stage_Object SHALL provide `mouseX` and `mouseY` in stage coordinates from the last pointer position that the Player received.
2. THE Stage_Object SHALL provide `frameRate` equal to the frame rate of the SWF.
3. THE Stage_Object SHALL provide a settable `scaleMode` and a `StageScaleMode` class with `NO_SCALE`, `SHOW_ALL`, `EXACT_FIT` and `NO_BORDER`.
4. WHEN a script sets `scaleMode`, THE Stage_Object SHALL store the value and the Shim SHALL record in `ADDED_APIS.md` that the value has no effect on drawing.
5. THE Stage_Object SHALL provide a settable `focus` that defaults to null.
6. IF a script sets `stage.focus` to the Stage_Object itself, THEN THE Shim SHALL accept the assignment without throwing.
7. THE value of `Stage.frameRate` SHALL come from Scene_JSON, and THE test SHALL use frame rates of 30 and 60.

### Requirement 9: Inherited instance members resolve before a same-named static

**User Story:** As a developer of a converted project, I want a bare identifier to resolve as AVM2 resolves it, so that `Game.stage = stage` assigns the inherited property.

#### Acceptance Criteria

1. WHEN a bare identifier inside an instance method names both an inherited instance member and a static member of the same class, THE Translator SHALL resolve it to the inherited instance member as `this.<name>`.
2. WHEN a bare identifier inside a static method names a static member, THE Translator SHALL resolve it to that static member.
3. THE rule SHALL extend the resolution order of the breadth spec (Requirement 22.1) and SHALL keep every earlier outcome that the order did not cover.
4. THE Ruffle_Source or a measured AS3 fixture SHALL confirm the scope order (instance `this` scope before class static scope), and the design SHALL record which.
5. FOR ALL Fixture_Classes with a static member and an inherited instance member of the same name, THE emitted statement `S.name = name` in an instance method SHALL assign `S.name = this.name` (property test over names and nesting depth of the `extends` chain).
6. THE tests SHALL use Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 10: Vector conversion call

**User Story:** As a developer of a converted project, I want `Vector.<T>(array)` to produce an array, so that code that builds a vector from an array literal runs.

#### Acceptance Criteria

1. WHEN the AS3 source calls `Vector.<T>(x)`, THE Translator SHALL emit a copy of `x` as an array.
2. WHEN `T` is `int` or `uint`, THE Translator SHALL coerce each element with the same rule as the `int` and `uint` conversion of the Translator.
3. THE Translator SHALL NOT comment out the statement that contains a `Vector.<T>(x)` call.
4. FOR ALL arrays `x`, THE emitted copy SHALL have the same length and the same elements as `x` for non-integer `T`, and SHALL NOT be the same array object (property test).

### Requirement 11: Statements the Translator reports and cannot translate

**User Story:** As a reader of the Translation_Report, I want each untranslated construct named, so that no code is silently dropped.

#### Acceptance Criteria

1. WHEN the Translator comments out an AS3 statement or declaration, THE Translation_Report SHALL name the construct, the class and the line.
2. WHEN a construct that the Translator comments out is `delete`, `is Array`, a `Dictionary` index, `Class` as a type, `flash_proxy` or a `this` read before `super`, THE Translation_Report SHALL name the construct by that word.
3. THE Translator SHALL translate `is Array` to `Array.isArray(x)`, `x is Class` to `typeof x === "function"`, and `delete obj[key]` on an object to a JavaScript `delete`.
4. FOR ALL `delete` on a `Dictionary` (Requirement 13), THE Translator SHALL emit `Map.delete`.
5. WHERE the Translator cannot translate a construct, THE class SHALL remain in the Unsupported_Feature_List with the construct named, as today.
6. THE tests SHALL use Fixture_Classes.

### Requirement 12: Error classes and utility functions

**User Story:** As a developer of a converted project, I want the AS3 error classes and utility functions that the games call, so that code that throws or reports a class name runs.

#### Acceptance Criteria

1. THE Shim SHALL export `ArgumentError` and `IllegalOperationError` as subclasses of `Error` whose `name` equals the class name.
2. THE Shim SHALL export `getQualifiedClassName(value)` that returns the registered class name of an instance and of a class object, using the registry name and never `constructor.name`.
3. IF `getQualifiedClassName` receives a class that is not in the registry, THEN THE Shim SHALL return the JavaScript function name.
4. THE Shim SHALL export `getTimer()` as an integer number of milliseconds since the Player started, read from the Player clock and never from `Date.now()`.
5. WHEN the Player clock is a manual clock that advances 1000 ms, THE value of `getTimer()` SHALL grow by 1000.
6. FOR ALL sequences of manual clock advances, THE value of `getTimer()` SHALL be non-decreasing and SHALL equal the sum of the advances truncated to an integer (property test).

### Requirement 13: Dictionary with identity keys

**User Story:** As a developer of a converted project, I want `Dictionary` to key by object identity, so that a map keyed by functions or objects does not collide.

#### Acceptance Criteria

1. THE Shim SHALL export `Dictionary` as a map that keys by identity for objects and functions and by value for strings and numbers.
2. WHEN the AS3 source reads `d[k]`, writes `d[k] = v`, tests `k in d` or runs `delete d[k]` on a variable of type `Dictionary`, THE Translator SHALL emit a call to the corresponding Map operation.
3. WHEN two different function objects are used as keys, THE Dictionary SHALL hold two distinct entries.
4. THE Dictionary SHALL ignore the `weakKeys` constructor argument and the Shim SHALL record the limit in `ADDED_APIS.md`.
5. FOR ALL sequences of set, get, has and delete operations over a pool of keys drawn from functions, objects, strings and numbers, THE Dictionary SHALL agree with a model that is a list of key and value pairs compared by `Object.is` (property test, model-based).
6. IF the Translator cannot decide that a variable is a `Dictionary`, THEN THE Translator SHALL leave the index syntax unchanged and SHALL name the site in the Translation_Report.

### Requirement 14: Graphics on Sprite and Shape

**User Story:** As a developer of a converted project, I want code-drawn vector graphics, so that games that draw with `graphics` show their shapes.

#### Acceptance Criteria

1. THE Shim `Sprite` and `Shape` SHALL provide a `graphics` object with `lineStyle(thickness, color)`, `beginFill(color)`, `endFill()`, `drawCircle(x, y, radius)`, `moveTo`, `lineTo`, `drawPath(commands, data, winding)` and `clear()`.
2. THE Shim SHALL export `GraphicsPathWinding` with `NON_ZERO` equal to `"nonZero"` and `EVEN_ODD` equal to `"evenOdd"`.
3. WHEN `drawPath` is called with a commands vector, THE Graphics SHALL treat command 1 as `moveTo` and command 2 as `lineTo`, and SHALL consume two data values per command.
4. IF `drawPath` receives a command other than 1 or 2, THEN THE Graphics SHALL skip that command's data and SHALL record a Named_Limit once per project.
5. WHEN `drawPath` follows a `lineStyle` and no `beginFill`, THE Graphics SHALL draw an open stroke and SHALL NOT close or fill the path.
6. WHEN a fill is active at the end of the frame and `endFill` was not called, THE Graphics SHALL fill the pending shapes, as Flash does at render time.
7. THE Runtime SHALL draw a display object's `graphics` below its children.
8. WHEN a Sprite is scaled, THE Runtime SHALL scale the line thickness with it, because the default `LineScaleMode` is normal.
9. WHEN `clear()` is called, THE Graphics SHALL discard all recorded commands.
10. THE Graphics SHALL be a recorded command list that both the FakeBackend and the PixiJS backend read, so that tests need no browser.
11. FOR ALL command sequences, THE recorded list SHALL replay to the same drawn primitives on the FakeBackend as were issued (property test over random sequences of `lineStyle`, `beginFill`, `drawCircle`, `moveTo`, `lineTo`).
12. WHERE `lineStyle` receives more than the two arguments of Requirement 14.1, THE Graphics SHALL ignore the extra arguments and SHALL record a Named_Limit.
13. WHEN `graphics` content changes, THE Runtime SHALL redraw on the next tick without a full-scene rebuild.

### Requirement 15: TextField, minimal

**User Story:** As a developer of a converted project, I want a `TextField` that shows a line of text, so that a game that creates a label from code shows it.

#### Acceptance Criteria

1. THE Shim SHALL export `TextField` as a display object with `text`, `textColor`, `selectable`, `width`, `height` and `textWidth`.
2. THE `TextField.width` setter SHALL set the width of the text box and SHALL NOT change `scaleX`.
3. WHEN `text` is set, THE `TextField.textWidth` getter SHALL return the measured width of the text in the same call, in pixels, without the 2 pixel gutter.
4. THE default values SHALL be `text` empty, `textColor` 0x000000, `width` 100, `height` 100 and `selectable` true.
5. THE Runtime SHALL draw the text on one line in the default device font (Times New Roman 12 pixel), in `textColor`.
6. THE Runtime SHALL record a Named_Limit that device-font metrics differ from Flash and that `textWidth` is measured in the browser.
7. THE `TextField` SHALL be an interactive object for hit testing, and a pointer event on it SHALL bubble to its parents.
8. WHERE a script reads `htmlText`, `autoSize`, `defaultTextFormat` or `multiline`, THE Translator SHALL name the member in the Translation_Report as not provided.
9. THE measurement function SHALL be injected so that tests on the FakeBackend use a fixed-width function.
10. FOR ALL strings, THE value of `textWidth` SHALL grow monotonically with the string length under the fixed-width function (property test).

### Requirement 16: filters stored

**User Story:** As a developer of a converted project, I want `DisplayObject.filters` to accept and return a filter list, so that a script that sets a filter runs.

#### Acceptance Criteria

1. THE Shim `DisplayObject` SHALL provide `filters` whose setter stores a copy of the array and whose getter returns a copy.
2. THE Shim SHALL export `GlowFilter` with the constructor `(color, alpha, blurX, blurY, strength)` and the same-named read and write properties.
3. WHEN a script assigns a non-empty list to `filters`, THE Runtime SHALL record a Named_Limit that names the filter class and does not draw it, unless the Runtime already draws that filter class.
4. WHEN a script changes the array it received from the getter, THE stored list SHALL stay unchanged.
5. FOR ALL arrays assigned to `filters`, THE getter SHALL return an equal array that is not the same object (property test).

### Requirement 17: MouseEvent additions

**User Story:** As a developer of a converted project, I want the mouse-wheel event type and delta, so that code that registers for the wheel type-checks.

#### Acceptance Criteria

1. THE Shim `MouseEvent` SHALL provide `MOUSE_WHEEL` equal to `"mouseWheel"` and a numeric `delta` that defaults to 0.
2. IF the Player does not dispatch the wheel event, THEN THE Runtime SHALL record the wheel event as a Named_Limit.
3. WHERE the wheel is dispatched, THE Player SHALL set `delta` from the browser wheel direction and SHALL record in the design which measurement fixed the sign.

### Requirement 18: Signal for entity_game (translator route)

**User Story:** As a user of `entity_game`, I want the game's signal class to work, so that its entities can notify each other.

#### Acceptance Criteria

1. THE Translator SHALL translate `org.osflash.signals.Signal`, `SignalBinding` and `SignalBindingList` from the decompiled source, using the rules of Requirements 3, 9, 11, 12 and 13, and no Hand_Written_Class SHALL replace them.
2. WHEN a listener is added twice to one `Signal`, THE translated `Signal` SHALL keep one binding.
3. WHEN `dispatch` is called with arguments whose class does not match `valueClasses`, THE translated `Signal` SHALL throw an `ArgumentError`.
4. THE translated `Signal` SHALL call listeners in the order of the decompiled `SignalBindingList`, and the order SHALL be confirmed by reading that source.
5. IF the translator route cannot make the `Signal` classes load and pass the checks of this requirement, THEN `handwritten/entity_game/org/osflash/signals/Signal.ts` MAY replace `Signal`, AND the Pipeline SHALL list that override by its qualified name (`handwritten/` path `a/b/Cls.ts` is class `a.b.Cls`) in the report, AND the Handwritten_Set SHALL then include `Signal` with its reason.
6. WHERE the fallback of Acceptance Criterion 5 is used, THE Pipeline CLI SHALL recognise a packaged override in `handwritten/<sample>/` and SHALL NOT report it as a missing override (the CLI lists only top-level `.ts` names today).
7. FOR ALL sequences of `add`, `addOnce`, `remove` and `dispatch` over a pool of listeners, THE `Signal` that runs in the Emitted_Project SHALL agree with a model that is a list with prepend on add (property test).

### Requirement 19: this.field in super arguments

**User Story:** As a developer of a converted project, I want a constructor that reads a field in the arguments of `super(...)` to run, so that classes written for AS3 initialisation order do not throw in JavaScript.

#### Acceptance Criteria

1. WHEN an AS3 constructor reads `this.<field>` or a bare instance field name in the arguments of `super(...)`, AND the field has an initialiser, THE Translator SHALL emit code that evaluates the initialiser into a local before `super(...)` and uses the local in the call.
2. THE Translator SHALL assign the field from the same local after `super(...)` returns, so that the field and the argument are the same object.
3. WHEN the field has no initialiser, THE Translator SHALL pass the default value of the field's type and SHALL record a Named_Limit when the field is assigned in the constructor body before use.
4. THE Translation_Report SHALL name each rewritten site.
5. FOR ALL Fixture_Classes whose constructor passes an initialised field to `super(...)`, THE emitted class SHALL load and construct without a `ReferenceError`, and the argument received by the base class SHALL be strictly equal to the field after construction (property test over the field's initialiser kind).
6. THE tests SHALL use Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 20: Unsupported base class Proxy

**User Story:** As a reader of the Translation_Report, I want `flash.utils.Proxy` named, so that a class that extends it is reported and not mistaken for a JavaScript `Proxy`.

#### Acceptance Criteria

1. WHEN a class extends `flash.utils.Proxy` and no Hand_Written_Class replaces it, THE Translator SHALL name the base class as unsupported and SHALL leave the class out of the registry, as for any unresolved base.
2. THE Translator SHALL NOT bind the name `Proxy` to the JavaScript global.
3. WHERE a Hand_Written_Class replaces the class, THE Translation_Report SHALL name the class as hand-written.
4. THE `spacer` class `KeyObject` SHALL be a Hand_Written_Class of the Handwritten_Set, with the reason that it extends `flash.utils.Proxy`, that the Shim has no `Proxy`, and that a Shim stub would ignore `flash_proxy` overrides without saying so.
5. THE Shim SHALL NOT provide a `Proxy` class.

### Requirement 21: MovieClip.currentLabel and scenes

**User Story:** As a developer of a converted project, I want `currentLabel` and scene-aware `gotoAndStop` and `gotoAndPlay`, so that timeline code that uses labels and scenes runs.

#### Acceptance Criteria

1. THE Shim `MovieClip` SHALL provide `currentLabel` that returns the label of the nearest labelled frame at or before `currentFrame`, or null when no such frame exists.
2. WHEN `currentFrame` lies after a labelled frame and before the next label, THE `currentLabel` SHALL return the earlier label.
3. THE Shim `MovieClip` SHALL provide `gotoAndStop(frame, scene)` and `gotoAndPlay(frame, scene)` in which `frame` is a frame number or a label and `scene` is an optional scene name.
4. WHEN `scene` is given and `frame` is a number, THE Shim SHALL go to the global frame equal to the scene's first frame plus `frame` minus 1.
5. IF `scene` names no scene, THEN THE Shim SHALL throw an `ArgumentError`.
6. THE Convert stage SHALL write the scene names and first frames from `DefineSceneAndFrameLabelData` to Scene_JSON, and THE Scene_JSON `formatVersion` SHALL be raised and documented.
7. WHEN a SWF has no `DefineSceneAndFrameLabelData` tag, THE Convert stage SHALL write one scene that starts at frame 1, so that existing samples are unchanged.
8. THE Shim_Member_Table SHALL be regenerated with the Shim change so that the Translator resolves a bare `currentLabel` to `this.currentLabel`.
9. THE Ruffle_Source SHALL be read for the scene-relative value of `currentFrame` and the design SHALL record it; THE Shim SHALL return the same value or the difference SHALL be a Named_Limit.
10. FOR ALL label sets with strictly increasing frames and all `currentFrame` values in range, THE `currentLabel` SHALL equal the label with the largest frame that is less than or equal to `currentFrame`, and SHALL be null when `currentFrame` is smaller than the first label frame (property test).
11. THE Scene_JSON round trip SHALL hold: FOR ALL scene lists, writing them to Scene_JSON and reading them back SHALL give an equal list (property test).
12. THE tests of the Shim rule SHALL use Fixture_Classes and a generated timeline, and SHALL NOT mention a sample name.

### Requirement 22: Timer, TimerEvent and the Player clock

**User Story:** As a developer of a converted project, I want `Timer` to fire on the Player clock, so that timer-based game logic behaves as in Flash and in tests.

#### Acceptance Criteria

1. THE Shim SHALL export `Timer` with the constructor `(delay, repeatCount = 0)` and `start()`, `stop()`, `reset()`, `delay`, `repeatCount`, `currentCount` and `running`.
2. THE Shim SHALL export `TimerEvent` with `TIMER` equal to `"timer"` and `TIMER_COMPLETE` equal to `"timerComplete"`.
3. WHEN `start()` is called on a stopped Timer, THE Timer SHALL set `running` to true and SHALL fire `TIMER` after a full `delay` of Player-clock time, whatever time elapsed before `stop()`.
4. WHEN a Timer with `repeatCount` greater than 0 has fired `repeatCount` times, THE Timer SHALL set `running` to false and SHALL dispatch `TIMER_COMPLETE`.
5. WHEN `stop()` is called, THE Timer SHALL set `running` to false and SHALL keep `currentCount`.
6. WHEN `reset()` is called, THE Timer SHALL stop and set `currentCount` to 0.
7. THE Timer SHALL fire from the Player clock and SHALL keep firing when its owner is not on the display list.
8. THE Timer SHALL fire between frames, after the frame update of the tick in which its due time falls.
9. IF `delay` is negative, not a number or infinite, THEN THE Timer constructor SHALL throw a `RangeError`.
10. WHEN `delay` is below 10 ms, THE Timer SHALL schedule its firings at an interval of 10 ms and SHALL keep `delay` unchanged when read back, AND THE Timer SHALL fire a due timer at most 10 times in one Player update and SHALL fire only when its due time is strictly less than the current clock time (read in the Ruffle_Source `core/src/timer.rs`: `MIN_INTERVAL`, `MAX_TICKS`).
11. WHEN `start()` is called on a Timer whose `currentCount` is at least `repeatCount` and `repeatCount` is greater than 0, THE Timer SHALL fire once and then complete, and the design SHALL record the Ruffle_Source files read for this rule and for the order of `running` and `TIMER_COMPLETE`.
12. FOR ALL sequences of `start`, `stop`, `reset` and clock-advance operations, THE Timer SHALL agree with a pure state-machine model for `running`, `currentCount` and the number of `TIMER` and `TIMER_COMPLETE` events (property test, model-based).
13. THE Timer tests SHALL use the manual clock and SHALL use frame rates of 30 and 60.

### Requirement 23: Collision support and the pixel-overlap helper

**User Story:** As a player of `spacer`, I want hits between sprites to register, so that shooting and damage work.

#### Acceptance Criteria

1. THE `spacer` class `PhysicEngine` SHALL be a Hand_Written_Class of the Handwritten_Set, with the reason that the Flash route needs `BitmapData.draw`, blend modes and colour transforms, which are out of scope.
2. THE `handwritten/spacer/PhysicEngine.ts` SHALL call exactly one Runtime helper `pixelsOverlap(a, b)` that returns true when the two objects cover a common pixel inside the intersection of their stage-space bounds, and the helper SHALL ignore the `visible` flag of the two objects (read in the Ruffle_Source: `core/src/bitmap/operations.rs`, `core/src/display_object.rs` `render_base`).
3. THE helper SHALL be a Runtime function, SHALL NOT depend on a Flash type, and SHALL have a test that uses generated shapes and no sample name.
4. THE helper SHALL be reported as an approximation, and the Fidelity_Report SHALL record a Named_Limit that names the coverage-mask method and that antialiased edge pixels are not counted.
5. THE Shim SHALL provide `Rectangle` with `x`, `y`, `width`, `height`, `left`, `top`, `right`, `bottom`, `intersection(rect)`, `offset(dx, dy)` and `intersects(rect)`.
6. WHEN two rectangles do not overlap, THE `intersection` SHALL return a rectangle at (0, 0) with width 0 and height 0.
7. WHEN `x` is set, THE `Rectangle` SHALL keep `width`; WHEN `left` is set, THE `Rectangle` SHALL change `width` so that `right` stays unchanged.
8. FOR ALL pairs of rectangles, THE `intersection` SHALL be commutative, SHALL lie inside both operands when non-empty, and its area SHALL be at most the smaller operand's area (property test).
9. FOR ALL rectangles, `offset(dx, dy)` followed by `offset(-dx, -dy)` SHALL give the original rectangle (property test).
10. THE Shim SHALL provide `DisplayObject.getBounds(targetSpace)`, and SHALL NOT provide `Matrix`, `hitTestObject`, `transform.concatenatedMatrix`, `BitmapData`, `ColorTransform` or `BlendMode`, because the chosen route needs none of them.
11. WHEN `getBounds` is called on a display object with no content, THE Shim SHALL return the value that the Ruffle_Source returns, or an Open_Item SHALL record the case (the analysis says "not verified").
12. WHEN a child of the source of a `draw` is invisible, THE design SHALL record the Ruffle_Source rule or an Open_Item for it, and the hitbox symbols of `spacer` SHALL be checked for invisible children and for fills with partial alpha.
13. THE `Translation_Report` SHALL list every class that this requirement replaces and why (Requirement 33).

### Requirement 24: Keyboard input in the Replay and the recorder

**User Story:** As a maintainer, I want keyboard input recorded against Ruffle and replayed against the Emitted_Project, so that a game with keyboard control can be compared.

#### Acceptance Criteria

1. THE Replay planner SHALL accept Key_Entries of type `KeyDown` and `KeyUp` with a key code and a tick.
2. WHEN a Key_Entry is planned for a tick, THE Replay runner SHALL dispatch it to the Player after that tick's update, using the same key-dispatch function as the browser wiring (Requirement 5).
3. THE Ruffle recorder SHALL write `KeyDown` and `KeyUp` entries into `input.json` in the format that Ruffle's test runner reads.
4. THE format of Ruffle's key entries (field names, key-code representation, whether a held key repeats) SHALL be read in the Ruffle_Source and recorded in the design.
5. THE Replay SHALL keep the measurement of the existing samples unchanged, and `clickgoto` SHALL keep Trace_Score 100 at an unchanged tick count.
6. IF an Input_Script holds an entry type that the Replay does not support, THEN THE Replay SHALL report the entry as `unsupported-input` as today.
7. FOR ALL Input_Scripts made of generated Key_Entries and Wait entries, parsing the Input_Script, planning it and serialising the plan back to entries SHALL give an equal entry list (round-trip property).
8. FOR ALL Input_Scripts, THE planner SHALL assign each Key_Entry to the tick of its Input_Group, and SHALL preserve the order of entries inside a group (property test).

### Requirement 25: Play_Tests

**User Story:** As a maintainer, I want one headless test per game that plays it, so that "plays" is a checked fact.

#### Acceptance Criteria

1. THE Play_Test for `entity_game` SHALL run the Emitted_Project in two layers, a Node layer on the FakeBackend and a headless Chromium layer, with the same Input_Script and the same assertions in both, and SHALL assert, from observable state, that:
   - the start click begins the game;
   - holding a direction key changes the ship's position and rotation;
   - the fire key increases the number of bullet display objects;
   - a bullet that overlaps a rock destroys or splits that rock;
   - no error is thrown during 30 seconds of play.
2. THE Play_Test for `spacer` SHALL assert, from observable state, that:
   - Enter starts the level;
   - each movement key moves the player and the player stays inside the scene bounds;
   - shooting increases the number of bullet display objects;
   - an enemy that is hit plays its death animation to its last frame and is then removed from the display list;
   - the pause key pauses the game, `Timer` instances do not advance while paused, and resume restores their behaviour as the game's own remaining-time code expects;
   - no error is thrown during 30 seconds of play.
3. THE Play_Tests SHALL assert that the page reported no runtime error to the error sink and that the type-check gate reported no failed class at load.
4. THE Play_Tests SHALL read state through a documented read-only inspection hook of the Player and SHALL NOT change game state.
5. THE Play_Tests SHALL use the Shared_Run_Cache and SHALL stay inside the Browser_Limit.
6. THE `spacer` Play_Test SHALL be skipped with a message when the Fetched_Sample is absent.
7. THE 30 seconds of play SHALL be driven by the manual clock in both layers (900 steps at 30 fps for `entity_game`, 1800 steps at 60 fps for `spacer`), THE Chromium layer SHALL be driven through the page query `?play=1` that installs `window.__swfPlay` and skips the `requestAnimationFrame` loop, and wall time SHALL be used only to wait for the page to load.
8. IF a game does not reach a state that an assertion needs, THEN THE test SHALL fail with the state that was reached.

### Requirement 26: Ruffle reference for the games

**User Story:** As a maintainer, I want a Ruffle reference for each game where Ruffle can produce one, so that the Trace_Score and the frames compare against the original.

#### Acceptance Criteria

1. FOR EACH game, THE implementer SHALL try to record the Input_Script against Ruffle and SHALL commit the Reference_Input, the options file and the Reference_Trace under `samples/<name>/reference/` when Ruffle runs the game and the trace is usable.
2. WHEN a game writes no `trace()` output, THE Verify_Stage SHALL report behaviour as `not-compared` with the reason `empty-reference-trace`, as defined by the breadth spec.
3. IF Ruffle cannot produce a usable reference for a game, THEN THE design SHALL record the reason, THE Trace_Score SHALL stay `not-compared` with that reason in the Fidelity_Report, and the acceptance of that game SHALL be Requirements 25 and 27.
4. THE implementer SHALL state at the next Checkpoint_Report whether Ruffle ran each game headlessly.
5. THE reference for `spacer` SHALL NOT be committed when it contains output of the GPL-3.0 SWF that is not already permitted by the licence; the design SHALL record the decision and the reason.
6. THE recorder and replay SHALL use the same Input_Script for one game.

### Requirement 27: Overall_Match and Score_Floors

**User Story:** As a maintainer, I want a measured visual score per game, so that the games have floors.

#### Acceptance Criteria

1. THE Verify_Stage SHALL measure Overall_Match on at least two frames per game for which a Reference_Frame can be rendered.
2. WHEN FFDec cannot render a Reference_Frame for a game, THE Fidelity_Report SHALL name the frame and the reason and the design SHALL record it.
3. THE `spacer` frame comparison SHALL include one frame of each scene (root frames 1 and 2).
4. WHEN a game's Overall_Match is measured, THE test file SHALL gain a Score_Floor for that game equal to the measured value rounded down to two decimals.
5. THE Score_Floors of existing samples SHALL NOT go down, and THE tolerance, the Reference_Frames and `src/verify/core/pixelDiff.ts` SHALL NOT change.
6. WHEN a game's Overall_Match is below 100, THE Fidelity_Report SHALL attribute every differing region to a cause that is a Named_Limit, a fixed defect or a recorded Open_Item.
7. WHEN the `spacer` fidelity run times out, as the analysis reports for frames 1 and 2, THE implementer SHALL find the cause, SHALL record it in the design, and SHALL NOT raise a timeout.
8. THE Checkpoint_Report SHALL list Overall_Match and Trace_Score for every sample, and a sample below 100 SHALL name its causes.

### Requirement 28: Samples, provenance and licences

**User Story:** As a maintainer, I want the two games admitted under their licences, so that the repository has no unlicensed content.

#### Acceptance Criteria

1. THE repository SHALL hold `samples/entity_game/` with the SWF, `PROVENANCE.md` and the MIT licence text under `samples/LICENSES/`.
2. THE `PROVENANCE.md` of `entity_game` SHALL state the upstream URL, the author, the licence, the SHA-256 of the SWF and the date.
3. THE repository SHALL hold `samples/spacer/PROVENANCE.md`, a fetch script, and an npm script (named in the design) that fetches or copies the SWF into `.work/`, and SHALL NOT hold the SWF or the converted output of `spacer`.
4. WHEN the fetch script runs, THE fetch script SHALL verify the SHA-256 of the SWF and SHALL exit with a distinct code on a mismatch, as the `static_text` script does.
5. WHERE a developer uses the local copy at `.work/games/spacer/test.swf`, THE fetch script SHALL accept a path argument and SHALL treat it as a local copy and not a download.
6. THE `PROVENANCE.md` of `spacer` SHALL state the GPL-3.0 licence, the upstream URL, the SHA-256 and the reason the SWF is not committed.
11. THE `PROVENANCE.md` of each game SHALL carry the licence text it needs, with the licence texts under `samples/LICENSES/`.
12. OPEN_ITEM (owner decision pending): THE upstream URL and upstream commit of `entity_game` and `spacer` are not known to this spec. UNTIL the owner supplies them, THE `fetch:spacer` script SHALL require the local path argument of Acceptance Criterion 5 and SHALL exit with code 2 and a message that asks for the path when no path is given, and THE `PROVENANCE.md` files SHALL mark the URL and commit as pending.
13. OPEN_ITEM (owner decision pending): THE licence under which the hand-written `spacer` files (`KeyObject`, `PhysicEngine`) are committed is not decided by this spec, because the files are adapted from GPL-3.0 source in a repository whose `LICENSE` is MIT. UNTIL the owner decides, THE implementer SHALL NOT commit `handwritten/spacer/*`, AND the `spacer` Play_Test SHALL skip with a message when `handwritten/spacer/` is absent.
7. THE tests that need a Fetched_Sample SHALL skip when it is absent and SHALL report the skip.
8. THE folder names, display names in reports and UI strings SHALL use `entity_game` and `spacer` and SHALL NOT contain the words "Asteroids" or "Breakout".
9. THE `swf-inspector` tools, which accept paths inside the repository only, SHALL be given the SWFs at their paths under `.work/games/`.
10. THE sample licence check hook SHALL pass for both samples.

### Requirement 29: Static text of spacer is drawn as shapes (Block D, optional)

**User Story:** As a viewer of the converted `spacer`, I want the HUD digits and the "Press Enter to begin" and "Pause" texts drawn, so that the screen shows what the original shows.

#### Acceptance Criteria

1. WHEN a placed symbol contains a Static_Text_Tag, THE Convert stage SHALL export the FFDec text SVG of that tag, SHALL convert it to Shape_JSON through the existing text path (`svgToShapeJson` in text mode, which resolves the `<use>` glyph references), and SHALL emit a shape symbol, as for a `DefineTextTag`.
2. THE Convert stage SHALL NOT add a `texts` field to Scene_JSON for a Static_Text_Tag, and THE Runtime SHALL NOT use a device font or a new static-text concept to draw it.
3. THE Runtime SHALL draw the 13 Static_Text_Tags of `spacer`, including the HUD digits, "Press Enter to begin" and "Pause".
4. WHEN a Static_Text_Tag uses an embedded font, THE drawn glyph outlines SHALL come from the embedded font of the SWF, and no Named_Limit for glyph metrics SHALL be recorded for it.
5. WHERE a placement of a Static_Text_Tag carries a `DropShadowFilter`, THE Pipeline SHALL record the filter as a Named_Limit that is stored and not drawn, and THE Fidelity_Report SHALL list it when a differing region lies inside the bounds of that placement.
6. THE Translator SHALL NOT add a `TextField` binding for a Static_Text_Tag, because no script of `spacer` refers to these texts by name.
7. WHEN a SWF holds no Static_Text_Tag, THE Convert stage SHALL produce the same Scene_JSON symbols for that SWF as before this requirement, so that existing samples are unchanged.
8. FOR ALL generated Static_Text_Tags, THE Convert stage SHALL emit a shape symbol whose bounds equal the bounds of the SVG of the tag (property test over generated SVG glyph sets).
9. THE tests SHALL use generated tags and Fixture_Classes and SHALL NOT mention a sample name, except for the measurement of Requirement 31.

### Requirement 30: Rotated width and height (Block D, optional)

**User Story:** As a developer of a converted project, I want `width` and `height` to measure rotated content, so that code that sizes or positions rotated clips gets the Flash values.

#### Acceptance Criteria

1. THE Shim `DisplayObject.width` and `height` getters SHALL return the width and height of the Rotated_Bounds, and SHALL NOT return the unrotated box scaled by `scaleX` and `scaleY`.
2. WHEN `rotation` is 0 and no skew is present, THE getters SHALL return the same values as before this requirement.
3. WHEN a script sets `width` or `height` on a rotated object, THE Shim SHALL change the scale so that the getter then returns the requested value, and SHALL read the Ruffle_Source or measure for the rule at rotations of 90 and 180 degrees, or record an Open_Item.
4. WHEN a display object has no content, THE `width` and `height` SHALL follow Requirement 23.11.
5. THE Shim SHALL compute the Rotated_Bounds from `getBounds` of Requirement 23.10.
6. FOR ALL rectangles and rotations, THE Rotated_Bounds SHALL contain the four rotated corners, and a rotation of 90 degrees SHALL swap `width` and `height` (property test).
7. FOR ALL objects, a rotation of 360 degrees SHALL give the same `width` and `height` as a rotation of 0 within a tolerance of 1e-6 (property test).
8. THE tests SHALL use Fixture_Classes and SHALL NOT mention a sample name.

### Requirement 31: Overall_Match of spacer before and after Block D (Block D, optional)

**User Story:** As a maintainer, I want the effect of Block D measured, so that the floor of `spacer` rises only on evidence.

#### Acceptance Criteria

1. BEFORE the first Block D task starts, THE implementer SHALL measure Overall_Match of `spacer` on the frames of Requirement 27.3 and SHALL record the value and the differing regions in the Checkpoint_Report of Checkpoint 4.
2. WHEN Block D is complete, THE implementer SHALL measure Overall_Match of `spacer` again on the same frames with the same tolerance and Reference_Frames.
3. WHEN the second measurement is higher than the first, THE Score_Floor of `spacer` SHALL rise to the second value rounded down to two decimals.
4. IF the second measurement is lower than the first, THEN THE implementer SHALL record the cause and SHALL keep the Score_Floor of Requirement 27.4.
5. THE Fidelity_Report SHALL attribute every remaining differing region to a Named_Limit, a fixed defect or an Open_Item, as Requirement 27.6 requires.
6. THE Checkpoint_Report SHALL give both values and the regions that Block D removed.
7. THE Score_Floors of the other samples, the tolerance, the Reference_Frames and `src/verify/core/pixelDiff.ts` SHALL NOT change.

### Requirement 32: Block D is gated on budget and ends at Checkpoint 4 (Block D, optional)

**User Story:** As the owner, I want Block D to run only when credits remain, so that the games from Blocks A to C are never put at risk.

#### Acceptance Criteria

1. WHEN Checkpoint 3 is accepted and the credits left cover the Block_D_Budget, THE implementer SHALL start Requirements 29 to 31.
2. IF the credits spent on Blocks A to C plus the Block_D_Budget exceed the total budget of Requirement 36.3, THEN THE implementer SHALL skip Block D, SHALL mark the Checkpoint 4 task as skipped, and SHALL record the skip, the reason and the amounts in the Checkpoint_Report of Checkpoint 3.
3. WHEN Block D runs, THE implementer SHALL stop at Checkpoint 4 as the final Checkpoint and SHALL wait for the owner.
4. IF Block D is skipped, THEN THE Named_Limits "static text not drawn" and "rotated width and height not measured" SHALL be listed in the Fidelity_Report of `spacer`.
5. IF Block D is skipped, THEN Requirements 29 to 31 SHALL be recorded as not started, and no test of them SHALL be present in the default suite.
6. IF the work of Block D exceeds the Block_D_Budget by more than one third, THEN THE implementer SHALL stop and report, as Requirement 36.4 states.

### Requirement 33: Named_Limits and honest reporting

**User Story:** As a reader of the reports, I want every approximation named, so that no output is silently wrong.

#### Acceptance Criteria

1. THE Pipeline SHALL record a Named_Limit for each of the following when it applies to a project: a filter that is stored and not drawn (`GlowFilter`, `DropShadowFilter`), device-font text metrics, skewed placements, the coverage-mask approximation of pixel collision, a wheel event that is not dispatched, `useCapture` and `useWeakReference` ignored, `scaleMode` without effect, and a `lineStyle` argument that is ignored.
2. WHEN a sample's Overall_Match is below 100, THE Fidelity_Report SHALL list the Named_Limits that explain it.
3. THE Translation_Report and the Fidelity_Report SHALL name every Hand_Written_Class of the Handwritten_Set with its reason, and SHALL NOT present it as translated.
4. WHEN an emitted class of the Handwritten_Set has the same name as a translated class, THE Translation_Report SHALL list the translated class as replaced.
5. WHERE the project has a Hand_Written_Class outside the Handwritten_Set, THE Pipeline SHALL warn in the report, and the tests SHALL fail on the committed samples.
6. THE existing `handwritten/` rule (an override of a class that is not linked and not in the emit closure is ignored with a warning) SHALL stay as it is.
7. FOR ALL Fidelity_Reports written for the samples of this repository, every Hand_Written_Class listed SHALL be a member of the Handwritten_Set (test over the committed samples).
8. THE Handwritten_Set SHALL be stored in `handwritten/SET.json` as a list of sample, class name and reason, THE Pipeline SHALL read it without any class or sample name in `src/`, AND a test SHALL check that every `.ts` file under `handwritten/` is listed and every listed entry has a file.
9. THE Handwritten_Set SHALL hold `KeyObject` and `PhysicEngine` of `spacer`, and SHALL hold `Signal` of `entity_game` only through the fallback of Requirement 18.5.
10. OPEN_ITEM (owner decision pending): THE licence of the hand-written `spacer` files is decided by the owner as stated in Requirement 28.13, AND the Translation_Report and Fidelity_Report SHALL NOT claim a licence for them until then.

### Requirement 34: Checkpoints and review

**User Story:** As the owner, I want a stop and an independent review at each Checkpoint, so that I see the state before more is spent.

#### Acceptance Criteria

1. THE `tasks.md` SHALL hold exactly four tasks named "Checkpoint": Checkpoint 1 after Block A, Checkpoint 2 after Block B, Checkpoint 3 after Block C and Checkpoint 4 after Block D.
2. WHEN a Checkpoint is reached and the full suite is green, THE implementer SHALL hand the review to the Fidelity_Reviewer and SHALL commit its report as `.kiro/specs/as3-coverage/reviews/checkpoint-<n>.md`.
3. WHEN the Fidelity_Reviewer reports a finding, THE implementer SHALL act on it before the next task and SHALL name the fixing commit in the Checkpoint_Report.
4. THE Checkpoint_Report SHALL contain: the real output of `git status`, the commits since the last stop, Overall_Match and Trace_Score for every sample, new Named_Limits, Open_Items, the Warm_Suite_Time and the Credits_Line.
5. THE implementer SHALL stop at each Checkpoint and wait for the owner.
6. WHEN Checkpoint 2 is reached, THE `entity_game` Play_Test SHALL pass and THE game SHALL be playable.
7. WHEN Checkpoint 3 is reached, THE `spacer` Play_Test SHALL pass and THE game SHALL be playable.
8. THE Block D tasks and Checkpoint 4 SHALL be started only if the credits left after Checkpoint 3 cover them.

### Requirement 35: Git discipline

**User Story:** As the owner, I want a clean history, so that I can regroup commits.

#### Acceptance Criteria

1. THE implementer SHALL work on the existing `wip/as3-coverage` branch and SHALL NOT create a branch, push, rebase, amend or reset.
2. THE implementer SHALL make one logical change per commit with its tests, with a subject of the form `Area: what changed` of at most 72 characters.
3. THE commit body SHALL give the reason, how the change was verified and what is not verified.
4. THE commit message SHALL NOT contain an attribution line, an emoji or a byte order mark.
5. WHEN an MCP tool, a hook or the Fidelity_Reviewer caught or changed something in the work of a commit, THE commit body SHALL say so in one line.
6. THE implementer SHALL stage files by path and SHALL NOT use `git add -A`, `git add .` or `git commit -a`.
7. THE change to a file under `template/shim/` SHALL be committed together with the regenerated `src/translate/shimMembers.generated.ts`.
8. THE implementer SHALL NOT commit anything under `tools/`, `node_modules/`, `out/`, `.work/` or `dist/`, and SHALL NOT commit the SWF or the converted output of `spacer`.

### Requirement 36: Suite time, budget and Flash behaviour evidence

**User Story:** As the owner, I want the suite to stay fast and the spend to stay near the plan, so that the work finishes.

#### Acceptance Criteria

1. THE default suite SHALL stay green, and THE Warm_Suite_Time SHALL stay at or below about 150 seconds, reported at every Checkpoint.
2. THE implementer SHALL NOT raise a timeout to reach this limit.
3. THE budget SHALL be about 600 credits: spec documents 40, Block A 130, Block B 170, Block C 200, Block D 60.
4. IF a block will exceed its share by more than one third, THEN THE implementer SHALL stop and report before spending more.
5. WHEN a Flash behaviour is added to the Shim or the Runtime, THE design or the commit body SHALL say whether it was read in the Ruffle_Source or measured, and a behaviour that is neither SHALL be an Open_Item.
6. THE Open_Items that the analysis marks "not verified" (Stage `enterFrame` order, `getBounds` of an empty clip, `BitmapData.draw` of an invisible source, Timer granularity, the override of a packaged class) SHALL each be measured or recorded as an Open_Item by Checkpoint 3.
7. THE implementer SHALL add each behaviour that was measured or read to `.kiro/steering/flash-behaviour.md` with its evidence, in the commit that adds it.
8. THE steering files `tech.md` and `structure.md` SHALL be updated for new commands, samples and directories in the commit that adds them.

### Requirement 37: The emitted project loads without an import-time error

**User Story:** As a user of a converted game, I want the page to load and start, so that a module-evaluation failure never ends as a silent timeout.

#### Acceptance Criteria

1. THE Emitted_Project SHALL load every translated class module without an import-time error, including a class that extends a translated base class.
2. WHEN the value-import graph of the emitted classes contains an Import_Cycle_Hazard, THE Translator SHALL choose the cut as the lexicographically first import of the base class on a shortest path from the base class to the derived class whose uses are all inside method bodies or instance field initialisers.
3. WHEN the Translator has chosen a cut, THE Translator SHALL rewrite each use of the cut import to `getDefinitionByName('<Qualified.Name>')` and SHALL remove the import.
4. THE Shim function `getDefinitionByName` SHALL read a registry that `classes.ts` fills with every emitted class, and not only the linked classes, before the Player is constructed.
5. IF no import on any path of an Import_Cycle_Hazard can be cut, THEN THE Translation_Report SHALL record the problem `import-cycle` with the path, and the class SHALL stay in the project.
6. THE Translator SHALL NOT reorder imports to avoid an Import_Cycle_Hazard and SHALL NOT route every cross-class reference through the registry.
7. THE emitted `index.html` SHALL install an `error` listener and an `unhandledrejection` listener before the module script that set `window.__swfResurrect` to an object that holds `ready` false and the Load_Error_Report.
8. IF a module fails to load, THEN THE Verify_Stage SHALL report the Load_Error_Report as the reason of the failure instead of a render timeout.
9. WHEN a class holds an initialiser such as `private var levelScene:* = LevelScene;` whose value use only closes an Import_Cycle_Hazard, THE Translator SHALL apply the cut of Acceptance Criterion 2.
10. FOR ALL generated class graphs that contain at least one Import_Cycle_Hazard with a cuttable import, THE emitted modules SHALL load in an order-independent bundle check without an import-time error (property test over generated graphs).
11. THE tests of this requirement SHALL use Fixture_Classes and generated graphs and SHALL NOT mention a sample name, except for the `spacer` page load that Checkpoint 3 measures.
