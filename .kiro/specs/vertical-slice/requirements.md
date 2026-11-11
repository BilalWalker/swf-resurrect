# Requirements Document

## Introduction

The vertical slice proves the SWF Resurrect pipeline end to end on simple ActionScript 3 SWFs. The Click_Sample (`samples/clickgoto/test.swf`) contains two nested two-frame sprites, each linked to a class with a click handler that drives both sprites' timelines. The slice unpacks each SWF with the FFDec command line, converts shapes to SVG, and converts the SWF structure to a Scene_JSON containing a Symbol_Table of Shape_Symbols and Sprite_Symbols. The slice then plays the result in a PixiJS runtime inside a generated Vite + TypeScript project. The Pipeline does not judge licensing. Provenance of every sample is enforced by a repository test over the Provenance_Note files instead. Features the slice does not handle (text, sound, buttons, filters, masks, video, morph shapes) are recorded in the Unsupported_Feature_List and skipped. The slice has no web UI, no LLM repair, and no verification harness. Those belong to later specs (`translate`, `verify`, `ui`, `hosting`).

## Glossary

- **Pipeline**: The command-line tool that runs the Unpack, Convert and Emit stages on one SWF.
- **Unpacker**: The Pipeline stage that runs the FFDec CLI as a separate process.
- **FFDec**: The JPEXS Free Flash Decompiler command line, a third-party dependency.
- **SWF_Structure_Dump**: The XML file FFDec writes with `-swf2xml`, holding the SWF's tag and timeline structure (symbols, placements, removals, labels, frame boundaries) and the header values, from which the Converter derives Scene_JSON. The Frame_Rate, the root frame count and the stage rectangle (in twips) are read from the root element of the dump, and the stage background colour is read from the `SetBackgroundColorTag` (white `#ffffff` when that tag is absent). FFDec has no separate timeline export. The XML declares its format version in `_xmlExportMajor` and `_xmlExportMinor`.
- **Symbol_Class_Map**: The FFDec `symbolClass` export, a CSV mapping each character id to its linked AS3 class name, where id 0 is the root timeline.
- **Converter**: The Pipeline stage that turns unpacked FFDec output into SVG files and Scene_JSON. The Converter writes its output to the Staging_Directory and also adds entries to the Unsupported_Feature_List.
- **Staging_Directory**: The directory where the Converter writes its output (SVG files and Scene_JSON) before the Emitter copies that output into the Emitted_Project `assets/` directory.
- **Emitter**: The Pipeline stage that writes the Emitted_Project, copying the Converter output from the Staging_Directory into the Emitted_Project `assets/` directory.
- **Emitted_Project**: The generated Vite + TypeScript + PixiJS project containing `runtime/`, `shim/`, `src/` and `assets/`.
- **Runtime**: The timeline player in the Emitted_Project `runtime/` directory, built on PixiJS.
- **Shim**: The Flash API layer in the Emitted_Project `shim/` directory.
- **Scene_JSON**: The JSON file describing the stage, the Symbol_Table and the root sprite.
- **Symbol_Table**: The Scene_JSON map from decimal symbol id to a Shape_Symbol or a Sprite_Symbol.
- **Shape_Symbol**: A Symbol_Table entry of type "shape" that references one SVG file and holds a bounds origin offset (x and y) in pixels.
- **Sprite_Symbol**: A Symbol_Table entry of type "sprite" that holds its own frames, labels and per-frame display lists. The root timeline is a Sprite_Symbol.
- **Display_List_Entry**: One placement in a frame of a sprite, holding depth, symbol id, matrix, colour transform and instance name. The symbol id may reference a Shape_Symbol or a Sprite_Symbol.
- **Frame_Script**: A function registered in the Shim for one (sprite, frame number) pair that runs when that sprite enters that frame.
- **Sample_SWF**: A SWF file under `samples/` used as slice input.
- **Click_Sample**: The Sample_SWF at `samples/clickgoto/test.swf`: an AS3 file with at least one Sprite_Symbol of two or more frames, placed as a named instance, linked to a class, with a mouse click handler. It has no motion tween; a sample with timeline motion belongs to a later spec.
- **Click_Handler**: The constructors and `clicked` methods of the `LeftButton` and `RightButton` classes in the Click_Sample, translated by hand for this slice. The `MainTimeline` and `EventWatcher` classes are test instrumentation and are not translated.
- **Provenance_Note**: The `PROVENANCE.md` file beside a Sample_SWF stating author, source URL, licence and, for the Click_Sample, the Expected_State.
- **Expected_State**: The table, documented in the Click_Sample Provenance_Note, giving for each named instance its `currentFrame` and playing or stopped state at start and after a click on each named instance.
- **Frame_Rate**: The frames per second declared in the SWF header.
- **Unsupported_Feature_List**: The list written by the Pipeline naming SWF features that were detected but not handled. The Converter and the Pipeline both add entries.

## Requirements

### Requirement 1: Sample SWFs and provenance

**User Story:** As a developer, I want every sample SWF to have documented provenance, so that the repository contains only legal and repeatable inputs.

#### Acceptance Criteria

1. THE repository SHALL contain at least one Click_Sample under `samples/`.
2. THE repository SHALL contain, beside every Sample_SWF, one Provenance_Note stating three non-empty fields: author name, source URL (an absolute http or https URL) and licence name.
3. THE Click_Sample SHALL be an ActionScript 3 file (FileAttributes ActionScript3 flag set) that contains at least one Sprite_Symbol with two or more frames, placed as a named instance and linked to a class, and at least one mouse click handler registered for a click event.
4. THE Provenance_Note of the Click_Sample SHALL state the Expected_State, giving for each named instance a frame number from 1 to that sprite's total frame count and a playing or stopped state, at start and after a click on each named instance.
5. THE licence named in every Provenance_Note SHALL be one of MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, CC0-1.0, CC-BY-4.0 or Unlicense, or an `OR` expression in which at least one term is on that list (for example `MIT OR Apache-2.0`).
6. THE Pipeline SHALL process any readable AS3 SWF path it is given without requiring a Provenance_Note, so that users can convert their own files.

### Requirement 2: Unpack with FFDec

**User Story:** As a developer, I want the Pipeline to unpack the SWF with FFDec, so that I do not write a SWF parser.

*Note: Checked by hand on the Click_Sample with FFDec 26.4.0. `-export shape,script,symbolClass <outdir> <swf>` writes `shapes/<id>.svg`, `scripts/<Class>.as` and `symbolClass/symbols.csv`. `-swf2xml <swf> <out.xml>` writes the SWF_Structure_Dump (XML export version 4.2). The Unpacker runs exactly these two FFDec invocations; header values come from the SWF_Structure_Dump, not from a separate FFDec call. FFDec warns that the XML structure is not final, so the version is checked. Exact options are settled in design.*

#### Acceptance Criteria

1. WHEN the Pipeline receives a path to a SWF file that exists and is readable, THE Unpacker SHALL run the FFDec CLI as a separate process exactly twice, once with `-swf2xml` and once with `-export shape,script,symbolClass`, and write its output to a working directory.
2. WHEN FFDec completes with exit code 0, THE Unpacker SHALL report the absolute paths of the exported shapes directory, the SWF_Structure_Dump file, the Symbol_Class_Map file and the exported AS3 source directory, and the Frame_Rate, root frame count and stage width and height in pixels read from the SWF_Structure_Dump.
3. IF the FFDec executable is not found, THEN THE Unpacker SHALL stop without starting a process, leave the working directory unchanged, and return an error naming the expected executable location.
4. IF FFDec exits with a non-zero exit code, THEN THE Unpacker SHALL stop and return an error containing the exit code and the FFDec standard error text.
5. IF FFDec does not complete within 60 seconds, THEN THE Unpacker SHALL terminate the FFDec process and return a timeout error stating the 60 second limit.
6. IF the input file is a valid SWF that does not contain AS3 code (ActionScript 1 or 2 only), THEN THE Unpacker SHALL stop before exporting and return an error stating that only AS3 is supported.
7. IF the input path does not exist, is not readable, or the file does not begin with a valid SWF signature (FWS, CWS or ZWS), THEN THE Unpacker SHALL stop without starting FFDec and return an error naming the input path and stating that the file is not a valid SWF.
8. IF FFDec exits with code 0 but any of the shapes, SWF_Structure_Dump, Symbol_Class_Map or AS3 source exports is missing from the working directory, THEN THE Unpacker SHALL stop and return an error naming each missing export.
9. IF the SWF_Structure_Dump declares an `_xmlExportMajor` version other than the one the Converter supports, THEN THE Unpacker SHALL stop and return an error stating the found version and the supported version.
10. IF the root element of the SWF_Structure_Dump lacks a readable Frame_Rate, root frame count or stage rectangle, THEN THE Unpacker SHALL stop and return an error naming each missing value.

### Requirement 3: Convert shapes to SVG

**User Story:** As a developer, I want shapes converted to SVG, so that the Runtime can draw the original vector art.

#### Acceptance Criteria

1. WHEN unpacking succeeds, THE Converter SHALL write exactly one SVG file per exported shape symbol, excluding morph shapes, into the Staging_Directory using FFDec's SVG export.
2. THE Converter SHALL name each SVG file using the decimal SWF character id of its symbol, with the extension `.svg` (for example, character id 12 produces `12.svg`).
3. IF an exported shape is a morph shape, THEN THE Converter SHALL write no SVG file for it, add one entry to the Unsupported_Feature_List that identifies the shape by its SWF character id and states that morph shapes are unsupported, and continue converting the remaining shapes.
4. IF an exported SVG file is not well-formed XML, THEN THE Converter SHALL stop with a non-zero exit status and an error message that names the offending file, and SHALL leave previously written SVG files in place.
5. IF FFDec fails to export the SVG for a shape symbol (no file produced or a zero-byte file), THEN THE Converter SHALL stop with a non-zero exit status and an error message naming the character id of the shape.
6. WHEN conversion of all shapes completes, THE Converter SHALL report the count of SVG files written and the count of morph shapes skipped, such that written plus skipped equals the number of exported shape symbols.
7. IF the unpacked input contains a text, sound, button, filter, mask or video tag, THEN THE Converter SHALL add one entry to the Unsupported_Feature_List for each such tag, identifying the kind and, where available, the SWF character id or tag name, and continue converting the remaining content.
8. WHEN the Converter records an unsupported character (text, sound, button, video or morph shape) or an unsupported mask or filter, THE Converter SHALL drop every placement that references that character or carries that mask or filter, remove any entry at that placement's depth from the affected frame, add one entry per dropped placement to the Unsupported_Feature_List identifying the sprite, frame, depth and kind, and continue converting.

### Requirement 4: Convert SWF structure to Scene_JSON

**User Story:** As a developer, I want the SWF structure written as JSON with a symbol table, so that the Runtime can build nested timelines and apply each frame's placements.

#### Acceptance Criteria

1. WHEN unpacking succeeds, THE Converter SHALL write exactly one Scene_JSON file into the Staging_Directory.
2. THE Scene_JSON SHALL contain the stage width in pixels, stage height in pixels, the stage background colour, Frame_Rate in frames per second, the Symbol_Table, and the symbol id of the root Sprite_Symbol, where the total frame count of the root Sprite_Symbol is an integer from 1 to 65535.
3. THE Scene_JSON SHALL contain, in each Sprite_Symbol (the root included), one frame entry per frame, where each frame entry holds the list of Display_List_Entry values with depth, symbol id, matrix (six numeric components), colour transform (eight numeric components: four multipliers and four offsets) and instance name, where an absent instance name is represented as an empty value and Display_List_Entry values are ordered by ascending depth.
4. THE Scene_JSON SHALL contain, in each Sprite_Symbol, each frame label of that sprite and the 1-based frame number of that label within that sprite, and a frame with no label SHALL NOT produce a label entry.
5. THE Scene_JSON SHALL contain, for each Shape_Symbol, the file name of one SVG file written under Requirement 3 and a bounds origin offset (x and y) in pixels.
6. FOR ALL valid Scene_JSON objects, serialising then parsing then serialising SHALL produce an equivalent Scene_JSON, where equivalent means identical field values and identical byte output on the second serialisation (round-trip property).
7. IF a Display_List_Entry references a symbol id that is not a Shape_Symbol, not a Sprite_Symbol and not an unsupported character recorded under Requirement 3 criteria 3 and 7, or a Shape_Symbol references an SVG file that does not exist in the Staging_Directory, THEN THE Converter SHALL stop with a non-zero exit status and an error message naming the symbol id, and SHALL NOT leave a partial Scene_JSON file in the Staging_Directory.
8. WHEN the Converter runs twice on the same unpacked input, THE Converter SHALL produce byte-identical Scene_JSON and SVG output.
9. IF the SWF_Structure_Dump cannot be read as a Scene_JSON (missing or malformed frame data), THEN THE Converter SHALL stop with a non-zero exit status and an error message naming the sprite and frame number or input item that failed, and SHALL NOT write a Scene_JSON file.
10. THE Converter SHALL write each frame's display list as fully resolved absolute state, with every PlaceObject move or replace and every RemoveObject already applied, so that the frame lists every instance present in that frame and no other instance.
11. THE Converter SHALL write matrix translation values and bounds origin offsets in pixels, converted from the twips used in the SWF.
12. THE Scene_JSON SHALL contain, in each Sprite_Symbol that the Symbol_Class_Map links to a class, the linked class name, and SHALL omit the class name for a Sprite_Symbol with no link.

### Requirement 5: Emit Vite project

**User Story:** As a developer, I want a generated Vite + TypeScript project, so that the result is a normal, maintainable web project.

#### Acceptance Criteria

1. WHEN conversion succeeds, THE Emitter SHALL write an Emitted_Project to the output directory containing `runtime/`, `shim/`, `src/`, `assets/`, `index.html`, `package.json`, `tsconfig.json` and a Vite configuration, where the Emitter produces `assets/` by copying the Converter output from the Staging_Directory.
2. THE Emitter SHALL configure the Emitted_Project TypeScript compiler in strict mode.
3. THE Emitter SHALL declare PixiJS as a dependency of the Emitted_Project with an exact pinned version, containing no range operators (such as `^`, `~`, `>`, `<`, `*`) and no tags (such as `latest`).
4. THE Emitter SHALL define `typecheck` and `build` scripts in the `package.json` of the Emitted_Project.
5. WHEN `npm run typecheck` runs in the Emitted_Project after dependencies are installed, THE Emitted_Project SHALL complete with exit code 0 and zero reported type errors.
6. WHEN `npm run build` runs in the Emitted_Project after dependencies are installed, THE Emitted_Project SHALL exit with code 0 and produce a static build output directory containing an `index.html` file and at least one JavaScript file, with no server-side runtime required to serve it.
7. WHEN the Emitter runs twice on the same Converter output, THE Emitter SHALL produce files with identical relative paths and identical byte content, independent of run time, absolute output path and file system enumeration order.
8. IF the output directory already contains files and the `--force` option is absent, THEN THE Emitter SHALL stop, report an error naming the output directory, and exit with a non-zero code without modifying the output directory.
9. WHERE the `--force` option is given and the output directory exists, THE Emitter SHALL delete all files and subdirectories inside the output directory, leaving the output directory itself in place, before emitting.
10. IF the `--force` option is given and the output directory, after resolving relative segments and symbolic links, is a filesystem root, the current user's home directory, the current working directory, an ancestor of the current working directory, or a directory containing the input SWF file, THEN THE Emitter SHALL delete nothing, report an error naming the output directory and the reason, and exit with a non-zero code.
11. IF the Emitter fails to write any file, THEN THE Emitter SHALL stop, report an error indicating the affected path and cause, and exit with a non-zero code, without leaving a partially written Emitted_Project reported as successful.

### Requirement 6: Play timeline in PixiJS runtime

**User Story:** As a viewer, I want the Runtime to play the timeline in a browser, so that the animation runs as it did in Flash.

#### Acceptance Criteria

1. WHEN the Emitted_Project page loads, THE Runtime SHALL load the Scene_JSON and all referenced SVG assets, create a PixiJS stage whose width and height in pixels equal the stage dimensions in the Scene_JSON, fill it with the Scene_JSON background colour, and render frame 1 of the root Sprite_Symbol.
2. WHILE the main timeline is playing, THE Runtime SHALL advance one frame every 1/Frame_Rate seconds, with each frame interval within ±10% of 1/Frame_Rate averaged over any 60 consecutive frames.
3. WHEN the main timeline reaches the last frame and its display duration of 1/Frame_Rate seconds elapses, THE Runtime SHALL loop to frame 1 and continue playing without a visible blank frame.
4. WHEN the Runtime renders a frame, THE Runtime SHALL place each Display_List_Entry at its depth using the matrix and colour transform from the Scene_JSON, so that entries with a higher depth value are drawn above entries with a lower depth value, and SHALL offset each Shape_Symbol drawing by its bounds origin offset.
5. WHEN an instance exists in frame N and does not exist in frame N+1, THE Runtime SHALL remove that instance from the stage when frame N+1 is rendered, so that zero stage objects remain for that instance after the render.
6. IF the Scene_JSON fails to load or is not valid JSON, THEN THE Runtime SHALL stop playback, display an error message on the page naming Scene_JSON as the failed asset, and render no frames.
7. IF an SVG asset fails to load or cannot be parsed, THEN THE Runtime SHALL display an error message on the page naming the failed SVG asset, and SHALL NOT begin playback until the error is shown.
8. IF a Display_List_Entry references an SVG asset that is not present in the loaded assets, THEN THE Runtime SHALL skip that entry, continue rendering the remaining entries, and display an error message on the page naming the missing asset.
9. WHEN an instance appears at the same depth with the same symbol id in consecutive frames, THE Runtime SHALL keep the same display object for that instance across those frames, so that its registered event listeners and its assigned properties persist, and SHALL update only its matrix, colour transform and instance name.
10. WHILE a Sprite_Symbol instance is on the stage and playing, THE Runtime SHALL advance that instance's own timeline one frame per tick of the main timeline and loop it to its frame 1 after its last frame.
11. WHEN a Sprite_Symbol instance is created, THE Runtime SHALL start it on frame 1 in the playing state, and an instance of a Sprite_Symbol with a single frame SHALL stay on frame 1.
12. WHILE a Sprite_Symbol instance is stopped, THE Runtime SHALL leave that instance on its current frame at every tick, independently of whether its parent or sibling instances are playing.

### Requirement 7: Flash API shim

**User Story:** As a developer, I want a minimal Flash API shim, so that translated code stays close to the original AS3.

#### Acceptance Criteria

1. THE Shim SHALL provide `DisplayObject` with the properties x, y, scaleX, scaleY, rotation (degrees), alpha (0 to 1, values outside the range clamped), visible (boolean), width, height, parent (null when not on a display list) and name (string, default empty string).
2. THE Shim SHALL provide `Sprite` with addChild, removeChild, getChildByName and numChildren, where numChildren equals the count of direct children, addChild appends the child at the highest index, and getChildByName returns null when no direct child has the given name.
3. THE Shim SHALL provide `MovieClip` with play, stop, gotoAndPlay, gotoAndStop, currentFrame (1-based integer), totalFrames (integer of at least 1) and frame labels that resolve to frame numbers.
4. THE Shim SHALL provide addEventListener and removeEventListener for the `ENTER_FRAME` event and the mouse click event.
5. WHEN gotoAndStop is called with a frame number from 1 to totalFrames or with a label that exists, THE Shim SHALL set currentFrame to that frame, render that frame's display list, and halt timeline playback.
6. WHEN gotoAndPlay is called with a frame number from 1 to totalFrames or with a label that exists, THE Shim SHALL set currentFrame to that frame, render that frame's display list, and continue timeline playback from that frame.
7. IF gotoAndPlay or gotoAndStop is called with a label that does not exist or a frame number outside 1 to totalFrames, THEN THE Shim SHALL leave currentFrame and the playing or stopped state unchanged, and log one warning containing the invalid value.
8. WHEN removeEventListener is called for a registered listener, THE Shim SHALL stop delivering that event type to the listener from the next dispatch onward, including when called from within a dispatch of the same event.
9. WHEN a Runtime tick occurs, THE Shim SHALL dispatch `ENTER_FRAME` once to every MovieClip on the stage, whether playing or stopped, and SHALL deliver it to each registered listener of that MovieClip in registration order.
10. WHEN a mouse click occurs on a display object with a registered click listener, THE Shim SHALL invoke each registered click listener once for that click, in registration order.
11. THE Shim SHALL provide `addFrameScript` on `MovieClip` with the AS3 signature, taking one or more pairs of a 0-based frame index (from 0 to totalFrames minus 1) and a function, as in the decompiled `addFrameScript(0,this.frame1,1,this.frame2)`, and registering each function as the Frame_Script for that (sprite, frame) pair, replacing any Frame_Script previously registered for the same pair.
12. WHEN a MovieClip enters a frame that has a registered Frame_Script, THE Shim SHALL run that Frame_Script exactly once for that entry, after the frame's display list is rendered and after the `ENTER_FRAME` listeners for that frame have run.
13. WHEN gotoAndPlay or gotoAndStop is called with a valid frame number or existing label, THE Shim SHALL run the Frame_Script registered for the target frame exactly once, after the target frame's display list is rendered.
14. WHEN gotoAndPlay or gotoAndStop is called from within a running Frame_Script, THE Shim SHALL let the running Frame_Script finish before running the Frame_Script of the target frame.
15. IF addFrameScript is called with a frame index outside 0 to totalFrames minus 1, THEN THE Shim SHALL register nothing for that pair and log one warning containing the invalid value.
16. WHEN play, stop, gotoAndPlay or gotoAndStop is called on a MovieClip instance, THE Shim SHALL change the frame and playing state of that instance only, leaving its parent and sibling instances unchanged.
17. THE Shim SHALL expose each named child instance of a MovieClip as a property of that MovieClip under the instance name, and SHALL expose `parent` on the child, so that translated code such as `this.parent.r_button.gotoAndStop(1)` works unchanged.

### Requirement 8: Click handler behavior

**User Story:** As a viewer, I want the click handler to work in the browser, so that the interaction of the original file is preserved.

#### Acceptance Criteria

1. THE Emitted_Project `src/` directory for the Click_Sample SHALL contain a TypeScript translation of the Click_Handler that compiles under `tsc` with zero errors and contains no placeholder identifiers of the form `_loc<N>_`.
2. WHEN the user clicks within the bounds of the display object that the Click_Handler is attached to, THE Runtime SHALL deliver exactly one mouse click event to each listener registered on that object.
3. WHEN the Click_Handler receives a click event, THE Emitted_Project SHALL perform the same timeline actions (play, stop, gotoAndPlay, or gotoAndStop, on the same target instance with the same frame number or label) as the original AS3 code, so that the `currentFrame` and playing or stopped state of each named instance after the click equal the Expected_State documented in the Click_Sample Provenance_Note.
4. WHERE a Sample_SWF binds a symbol to a linked class, THE Runtime SHALL instantiate the linked class and assign each named stage instance of that symbol to the class property of the same name before the first frame script runs.
5. WHEN the user clicks outside the bounds of every display object that has a registered click listener, THE Runtime SHALL deliver zero click events to any listener and SHALL leave the timeline `currentFrame` unchanged.
6. IF the Runtime cannot bind a named stage instance to a property of the linked class, THEN THE Runtime SHALL continue loading and leave that property undefined.
7. IF the Converter finds a named stage instance of a symbol bound to a linked class and the AS3 source of that class declares no property of that name, THEN THE Converter SHALL add an entry naming the unbound instance name and the class to the Unsupported_Feature_List and continue converting.

### Requirement 9: Single-command pipeline

**User Story:** As a developer, I want the slice runnable with a single command, so that I can repeat it during later work.

#### Acceptance Criteria

1. WHEN the developer runs the Pipeline command with a SWF path and an output directory, THE Pipeline SHALL run the Unpack, Convert and Emit stages in that order and write the Emitted_Project to the output directory.
2. WHEN the Pipeline command completes all three stages without error, THE Pipeline SHALL exit with exit code 0 and print a completion message that includes the output directory path.
3. THE Pipeline SHALL implement the Unpack, Convert and Emit stages as separate modules, where each module accepts only its declared input artifact and returns only its declared output artifact.
4. WHEN a stage fails, THE Pipeline SHALL stop without running any later stage, print the failed stage name and an error message describing the failure, and exit with a non-zero exit code.
5. IF the SWF path does not exist, is not readable, or the output directory cannot be created or written to, THEN THE Pipeline SHALL run no stage, print an error message identifying the invalid path, and exit with a non-zero exit code.
6. WHEN the Pipeline finishes, whether it succeeds or a stage has failed after Convert completed, THE Pipeline SHALL write the Unsupported_Feature_List, including all entries added by the Converter, to a file in the output directory, containing an empty list when no unsupported features were detected, except as stated in criterion 9.
7. THE Pipeline SHALL make zero LLM calls and zero frame comparisons during the slice.
8. THE Pipeline SHALL accept the `--force` option defined in Requirement 5 and pass it to the Emitter.
9. IF the Emitter refuses because the output directory is non-empty and `--force` is absent (Requirement 5 criterion 8) or because the `--force` target is unsafe (Requirement 5 criterion 10), THEN THE Pipeline SHALL NOT write the Unsupported_Feature_List into the output directory and SHALL print it to standard error.

### Requirement 10: Automated tests

**User Story:** As a developer, I want automated tests for the slice, so that regressions are caught early.

#### Acceptance Criteria

1. THE Pipeline test suite SHALL include a property-based test, run with at least 100 generated Scene_JSON inputs (each with a Symbol_Table containing Shape_Symbols and Sprite_Symbols), asserting that serialising a Scene_JSON and parsing the result yields a value deeply equal to the original.
2. THE Pipeline test suite SHALL include a property-based test, run with at least 100 generated in-memory unpacked-model inputs and without running FFDec, asserting that two Converter runs on the same input produce byte-identical output files and an identical set of output file names.
3. THE Pipeline test suite SHALL include a property-based test, run with at least 100 generated in-memory model inputs and without running FFDec, asserting that for every symbol id referenced by a Display_List_Entry in a generated model, either the symbol exists in the Symbol_Table and every Shape_Symbol has a matching SVG file, or the Converter reports an error identifying that symbol id.
4. THE Pipeline test suite SHALL include a unit test asserting that, for a Scene_JSON with N frames (N between 2 and 10) and a given Frame_Rate, the Runtime advances exactly one frame per 1/Frame_Rate seconds (using a controlled clock), and after the last frame advances to frame 1 on the next tick.
5. THE Pipeline test suite SHALL include an end-to-end smoke test that runs the Pipeline on every Sample_SWF and then runs `typecheck` and `build` on each Emitted_Project, and the test passes only if the Pipeline and both commands exit with code 0 for every Sample_SWF.
6. WHEN `npm test -- --run` runs, THE Pipeline test suite SHALL execute all tests once in non-watch mode and exit with code 0 if all tests pass, or a non-zero code if any test fails.
7. IF a property-based test finds a failing input, THEN THE Pipeline test suite SHALL report the test as failed and output the minimal failing input (shrunk counterexample) and the random seed used.
8. IF the end-to-end smoke test cannot run because the FFDec CLI or a Sample_SWF is unavailable, THEN THE Pipeline test suite SHALL report the test as failed with a message identifying the missing dependency, and SHALL NOT report it as passed or skipped.
9. THE Pipeline test suite SHALL include a repository provenance test over every `.swf` file under `samples/` that fails, naming the file and the missing or invalid field, WHEN the Provenance_Note beside the file is missing, WHEN its author is empty, WHEN its source URL is not an absolute http or https URL, or WHEN its licence does not satisfy Requirement 1 criterion 5.
10. THE repository provenance test SHALL fail, naming the Click_Sample, WHEN the Provenance_Note of the Click_Sample lacks a valid Expected_State, and SHALL fail WHEN no Click_Sample exists under `samples/`.
11. THE Pipeline test suite SHALL include unit tests asserting that the Emitter, WHEN `--force` is absent, fails on a non-empty output directory without modifying it, and WHEN `--force` is given, deletes only the contents of the output directory and refuses the unsafe paths listed in Requirement 5.
