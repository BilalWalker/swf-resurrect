# Implementation Plan: vertical-slice

## Overview

Language: TypeScript (strict), as in the design. The plan runs in this order: scaffold, FFDec fixture gate, shortest path to `samples/clickgoto/test.swf` running in a browser, a manual browser checkpoint, hardening, optional property tests, the e2e smoke test, and a final checkpoint.

Rules that apply to every task:

- Files under `src/convert/` that carry logic (`convertModel.ts`, `resolveTimeline.ts`, `sceneJson.ts`) and `src/emit/planEmit.ts` import no `node:fs` or `node:child_process`, and use no `Date`, `Math.random` or `localeCompare`.
- Only `src/convert/ffdecXml.ts` names FFDec XML elements or attributes.
- Files under `template/` are real TypeScript, tested by Vitest and emitted verbatim.
- `ENTER_FRAME` goes to every clip on every tick, playing or stopped.
- The Unpacker runs exactly two FFDec invocations (`-swf2xml`, `-export shape,script,symbolClass`). No `-header` call.
- The Converter writes to the staging directory. The Emitter copies it into `assets/`.
- All dependency versions are exact (no `^`, `~`, ranges or tags), chosen with `npm view`.
- Commands are PowerShell compatible. Test runs use `npm test -- --run`, never watch mode. Never block on a dev server or `vite preview`.
- Do not edit `requirements.md`, `design.md` or `.kiro/steering/tech.md` from any task.

## Tasks

- [x] 1. Scaffold the repository
  - [x] 1.1 Create the project skeleton and tooling
    - Create `package.json` (name `swf-resurrect`, `"type": "module"`), `tsconfig.json` (strict, covers `src/` and `test/`), `tsconfig.template.json` (strict, covers `template/`, DOM lib, used by a `typecheck:template` script), `vitest.config.ts`.
    - Choose exact versions with `npm view <pkg> version` for `typescript`, `vitest`, `fast-check`, `fast-xml-parser`, `tsx`, `@types/node`, and the PixiJS and Vite versions needed to typecheck `template/` (pixi.js and vite are also recorded for Task 7.1). Write them without range operators.
    - Scripts: `test` (`vitest`, so `npm test -- --run` is a single run), `typecheck` (`tsc --noEmit`), `typecheck:template`, `pipeline` (`tsx src/pipeline/cli.ts`).
    - Create the directory layout from the design with `.gitkeep` files where empty: `src/pipeline`, `src/unpack`, `src/convert`, `src/emit`, `template/runtime/pixi`, `template/shim`, `template/src`, `handwritten/clickgoto`, `test/unit`, `test/property`, `test/e2e`, `test/fixtures`, `test/support`.
    - Extend `.gitignore` with `node_modules/`, `tools/ffdec/`, `tools/ffdec_*.zip`, `.work/`, `out/`, `dist/`, `*.tsbuildinfo`. Keep `.kiro/` tracked. Do not remove existing entries.
    - Add `test/property/config.ts` exporting a shared fast-check config with `numRuns: 100` and `verbose: 1`.
    - Run `npm install`, `npm run typecheck` and `npm test -- --run` (with a trivial smoke test) and confirm they run.
    - _Requirements: 10.6, 10.7_

- [x] 2. Gate: capture real FFDec fixtures and confirm the "to verify" items
  - [x] 2.1 Run the two verified FFDec invocations and capture small fixtures
    - Confirm Java 17+ with `java -version` and that `tools/ffdec/ffdec-cli.jar` exists.
    - Run into a scratch directory under `.work/ffdec-capture/` (gitignored): `java -jar tools/ffdec/ffdec-cli.jar -swf2xml samples/clickgoto/test.swf .work/ffdec-capture/structure.xml` and `java -jar tools/ffdec/ffdec-cli.jar -export shape,script,symbolClass .work/ffdec-capture samples/clickgoto/test.swf`. Strip ANSI codes from any captured console output.
    - Check file sizes with `Get-ChildItem`. Copy into `test/fixtures/clickgoto/` only small files: the `structure.xml` (whole file if under 100 KB, otherwise the head with the root element plus the tags the sample needs), `symbols.csv`, every `shapes/<id>.svg`, and `scripts/LeftButton.as`, `scripts/RightButton.as`, `scripts/MainTimeline.as`. Record the sizes in the findings note.
    - Do not commit anything from `tools/` and do not copy `original-source/`.
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Confirm every "to verify" item against the real dump and record the names in code
    - Open the captured `structure.xml` and answer each row of the design's "To verify against the real XML dump" table, plus: AS3 FileAttributes flag name, shape definition tag names, morph shape tag names, unsupported-kind tag names (text, sound, button, video), filter list and clip depth fields, label tag, declared sprite frame count attribute, root attributes for Frame_Rate, root frame count and stage rectangle, `SetBackgroundColorTag` fields, matrix and colour-transform field names and fixed-point scaling, `PlaceObject`/`PlaceObject3Tag`/`RemoveObject2Tag` fields.
    - Create `src/convert/ffdecXml.ts` containing only an exported `as const` object of the verified element and attribute names (`FFDEC_XML`), `SUPPORTED_XML_MAJOR`, and a comment per name saying it was verified on FFDec 26.4.0. Mark any name that could not be confirmed on the sample as `UNVERIFIED` in a comment.
    - Write `test/fixtures/clickgoto/FINDINGS.md` listing each item, the confirmed answer, and the fixture line it comes from.
    - _Requirements: 2.2, 2.6, 2.9, 2.10, 4.3, 4.4_

  - [x] 2.3 Check the SVG origin sign convention and the empty-sprite and zero-shape questions
    - For each captured shape SVG, record the `<g transform="matrix(1,0,0,1,tx,ty)">` values. Using the Click_Sample placements from `samples/clickgoto/PROVENANCE.md` (`l_button` at 143.5, 270; `r_button` at 415, 272.5) and the shape bounds, confirm that drawing the SVG at `(-tx, -ty)` inside the shape node puts the shape's own origin at the placement point. Record the result and, if the sign is the other way, say so clearly.
    - Determine how FFDec dumps a `DefineSpriteTag` with zero `ShowFrameTag` items (use a hand-edited copy of the XML in `.work/` if the sample has none) and whether `-export shape` creates an empty `shapes/` folder for a SWF without shapes. If this cannot be tested on the sample, write "not verifiable on this sample" and keep the design's fallback.
    - Check whether `-export shape` also writes morph shapes, and whether FFDec output is byte-identical across two runs (run the SVG export twice and compare hashes with `Get-FileHash`).
    - Append all answers to `test/fixtures/clickgoto/FINDINGS.md`. Add a short code comment in `src/convert/ffdecXml.ts` pointing to the findings note for the origin sign.
    - _Requirements: 3.1, 4.5, 4.8, 4.11, 6.4_

- [x] 3. Checkpoint - Fixture gate
  - Ensure all tests pass, ask the user if questions arise. Show the user `test/fixtures/clickgoto/FINDINGS.md` and wait for confirmation before the parsers in Tasks 4 and 5 are written. If any finding conflicts with the design, stop and tell the user instead of adapting silently.

- [x] 4. Unpacker
  - [x] 4.1 Add shared error base, ANSI stripping and SWF signature check
    - Create `src/pipeline/errors.ts` with `PipelineError` (abstract `stage` and `code`).
    - Create `src/unpack/errors.ts` with `InvalidSwfError`, `FfdecNotFoundError`, `JavaNotFoundError`, `FfdecExitError`, `FfdecTimeoutError`, `NotAs3Error`, `MissingExportError`, `XmlVersionError`, `MissingHeaderValueError`, each with the message contents from the design's Unpack error table.
    - Create `src/unpack/ansi.ts` (`stripAnsi`) and `src/unpack/swfSniff.ts` (`isSwfSignature(bytes)`, `assertValidSwfFile(path)` which checks existence, readability and the first three bytes `FWS`/`CWS`/`ZWS`).
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 4.2 Implement `readDumpHeader` in `src/convert/ffdecXml.ts`
    - Add pure `readDumpHeader(xmlText)` returning `{ xmlVersion, header: SwfHeader }` using the names confirmed in Task 2.2. Stage width and height are the rectangle extent in twips divided by 20. Throw `MissingHeaderValueError` naming each missing or non-finite value (`frameRate`, `frameCount`, `stageRect`).
    - Export `checkXmlVersion` that throws `XmlVersionError(found, supported)` when the major is not `SUPPORTED_XML_MAJOR`, and `isAs3Dump(xmlHead)`.
    - Add a small example test `test/unit/readDumpHeader.test.ts` on the captured fixture (expect 550 x 400, 24 fps, 3 frames).
    - _Requirements: 2.2, 2.6, 2.9, 2.10_

  - [x] 4.3 Implement `unpack` with exactly two FFDec invocations
    - Create `src/unpack/spawnFfdec.ts` (`spawn(java, ['-jar', jar, ...args], { shell: false })`, ANSI-stripped output, kill on timeout) and `src/unpack/unpack.ts` exporting `UnpackInput`, `UnpackResult`, `unpack`.
    - Order: validate the SWF, check that the jar exists, run `-swf2xml`, read the dump (AS3 check, version check, `readDumpHeader`), then run `-export shape,script,symbolClass`, then check the four exports exist. Return absolute paths plus header values as in the design.
    - Make the spawner injectable so later error-path tests need no Java.
    - Add one small example test that runs `unpack` on `samples/clickgoto/test.swf` with the real jar into a temp directory and checks the returned header values (this doubles as the FFDec availability check for the fixture work).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 5. Converter IO reader
  - [x] 5.1 Define the TagsModel types
    - Create `src/convert/model.ts` with `TagsModel`, `TimelineModel`, `SpriteModel`, `TimelineOp`, `MatrixModel`, `ColorTransformModel`, `ShapeAssetModel`, `SymbolClassEntry`, `ClassSourceModel`, `UnsupportedObservation`, `UnsupportedKind` exactly as in the design's Data Models section. Types only, no imports of `fs`.
    - _Requirements: 4.1, 4.3_

  - [x] 5.2 Implement the small readers: `symbolsCsv.ts`, `svgOrigin.ts`, `classProps.ts`
    - `parseSymbolsCsv(text)` and `formatSymbolsCsv(entries)` (`<id>;"<Class>"`, id 0 is the root).
    - `extractSvgOrigin(svgText)` returns `{x, y}` from the outer `<g transform="matrix(1,0,0,1,tx,ty)">` or `null`, using the convention recorded in `FINDINGS.md`.
    - `extractClassProperties(asSource)` returns declared `var` names, skipping `[Embed(...)]` metadata lines.
    - Add one small example test per function on the captured fixtures (`symbols.csv`, a shape SVG, `LeftButton.as`).
    - _Requirements: 4.5, 4.12, 8.7_

  - [x] 5.3 Implement the structure-dump adapter in `src/convert/ffdecXml.ts`
    - Add `parseStructure(xmlText): { background, root, sprites, declaredShapeIds, morphShapeIds, unsupported }` using `fast-xml-parser` with `preserveOrder: true` and the names in `FFDEC_XML`. Produce `TimelineOp[]` for place (with `move`, `characterId`, `matrix`, `colorTransform`, `name`, `clipDepth`, `hasFilters`), remove, label and showFrame. Leave matrix translations in twips (`txTwips`, `tyTwips`).
    - Unrecognised definition tags become `other-tag` observations. Unknown placement tag variants without known fields become `other-tag` observations instead of being guessed.
    - Add a small example test on the captured fixture: sprites 3 and 6 have two frames each, root has 3 frames, placements at depth 1 (character 6, `l_button`) and depth 3 (character 3, `r_button`).
    - _Requirements: 3.7, 4.3, 4.4, 4.9_

  - [x] 5.4 Implement `readUnpacked`
    - Create `src/convert/readUnpacked.ts`: `readUnpacked(unpacked: UnpackResult): Promise<TagsModel>`. Read the dump, `symbols.csv`, every `shapes/*.svg` (check well-formedness with the XML parser, extract origin) in sorted order, and the class sources for every linked class. Throw `MissingExportError` when `shapes/` is absent but the dump declares shapes; treat an absent `shapes/` as empty otherwise (per `FINDINGS.md`).
    - Add one small example test building a `TagsModel` from the fixture directory and checking shape ids 1, 2, 4, 5 and class names `MainTimeline`, `LeftButton`, `RightButton`.
    - _Requirements: 3.4, 4.1, 4.12, 8.7_

- [ ] 6. Pure converter, scene types and writer
  - [x] 6.1 Define Scene_JSON types, `validateScene` and `parseScene`
    - Create `template/runtime/scene.ts` with `SceneJson`, `ShapeSymbol`, `SpriteSymbol`, `DisplayListEntry`, `validateScene` and `parseScene` (throws `SceneParseError`) with the checks listed in the design. No Node imports.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.12_

  - [x] 6.2 Implement canonical serialisation
    - Create `src/convert/sceneJson.ts` with `serialiseScene` (sorted keys at every level by code unit, two-space indent, `\n`, one trailing newline, `-0` normalised, finite numbers only) importing the types and `parseScene` from `template/runtime/scene.ts`.
    - _Requirements: 4.6, 4.8_

  - [~] 6.3 Write property test for Scene_JSON round trip
    - Create `test/property/sceneRoundTrip.test.ts` and the generator `test/property/gen/genScene.ts` (shape and sprite symbols, labels, class names, nested sprite references, finite numbers).
    - **Property 1: Scene_JSON round trip**
    - **Validates: Requirements 4.6, 10.1**

  - [~] 6.4 Implement `resolveTimeline`
    - Create `src/convert/resolveTimeline.ts` implementing the design's placement resolution (place, move, replace, remove, label, showFrame), full absolute state per frame, ascending depth, twips divided by 20 with `-0` normalised, labels with 1-based frames, dropped placements for unsupported characters, masks and filters (returned as dropped-placement records with sprite, frame, depth, kind), warnings for the non-fatal cases, and `MalformedFrameDataError` for the fatal cases.
    - Create `src/convert/errors.ts` with `ConvertError`, `UnknownSymbolError`, `ShapeExportError`, `MalformedSvgError`, `MalformedFrameDataError`, `SymbolCycleError`.
    - _Requirements: 3.8, 4.3, 4.4, 4.9, 4.10, 4.11_

  - [~] 6.5 Write property test for frame display lists against an independent replay
    - Create `test/property/resolveTimeline.test.ts` with generators `test/property/gen/genTimelineOps.ts` and a separately written array-based reference replay in the test.
    - **Property 4: Frame display lists equal an independent replay of the placement operations**
    - **Validates: Requirements 4.3, 4.10, 4.11**

  - [~] 6.6 Implement `convertModel`
    - Create `src/pipeline/unsupported.ts` with `UnsupportedFeatureEntry`, the total-order sort and the canonical file serialiser (`{ "entries": [...], "formatVersion": 1 }`).
    - Create `src/convert/convertModel.ts`: validate the model shape, index by id, build `svgFiles` (line endings normalised to `\n`, sorted by id), skip morph shapes with entries, call `resolveTimeline` for the root (id 0) and each sprite, attach `className`, run the reference check (`UnknownSymbolError`), the cycle check, add unsupported entries (observations, morph, dropped placements, `unbound-instance`), assemble `SceneJson`, run `validateScene`. Return `ConvertResult` with `stats` and sorted `warnings`.
    - Add one small example test: the Click_Sample model built by `readUnpacked` (or a hand-copied fixture model) converts to a scene with symbols 0..6 and matrices (143.5, 270) and (415, 272.5).
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.12, 8.7_

  - [~] 6.7 Write property test for conversion determinism and order independence
    - Create `test/property/convertDeterminism.test.ts` with `test/property/gen/genTagsModel.ts`. Run `convertModel` twice and on permuted list orders, comparing serialised scene text, SVG contents and file names. Add a guard test that greps the pure files for `node:fs`, `node:child_process`, `Date`, `Math.random`, `localeCompare`.
    - **Property 2: Conversion is deterministic and independent of list order**
    - **Validates: Requirements 4.8, 10.2**

  - [~] 6.8 Implement the converter writer and `convertStage`
    - Create `src/convert/writeConverted.ts` with `ConvertedArtifact` and `convertStage(unpacked)`: `readUnpacked`, `convertModel` (before any write), then write SVGs ascending by id into `<workDir>/converted/assets/`, and `scene.json` last through a temp file and `rename`.
    - _Requirements: 3.1, 3.2, 3.6, 4.1, 4.7, 4.9_

- [ ] 7. Minimal Emitter
  - [x] 7.1 Pin versions and generate `package.json`
    - Create `src/emit/versions.ts` with exact versions of `pixi.js`, `vite`, `typescript` chosen with `npm view <pkg> version`, and verify the PixiJS 8 API names the adapter needs (`Application.init`, `Graphics.svg`) against the installed package. Add a unit test that each version matches `^\d+\.\d+\.\d+$`.
    - Create `src/emit/packageJson.ts` building the emitted `package.json` with sorted keys, name `swf-resurrect-output`, scripts `dev`, `build`, `typecheck`, and exact dependency versions.
    - _Requirements: 5.3, 5.4_

  - [x] 7.2 Add the static template files
    - Create `template/index.html`, `template/vite.config.ts` (relative base), `template/tsconfig.json` (strict), and `template/src/classes.ts` (default empty `classRegistry`, replaced by the generated file during planning). Do not create `package.json` there (it is generated).
    - _Requirements: 5.1, 5.2_

  - [~] 7.3 Implement `planEmit` and a basic `emit`
    - Create `src/emit/planEmit.ts` (pure): copies template files, generates `package.json` and `src/classes.ts` (import and registry entry for each handwritten class linked in the Symbol_Table), copies `assets/scene.json` and `assets/<id>.svg`, sorted by path, `\n` line endings.
    - Create `src/emit/emit.ts`: resolve the output directory, refuse a non-empty directory when `force` is false (`OutputDirNotEmptyError`, directory untouched), plan in memory, write files in sorted order. The `--force` deletion logic is added in Task 7.4.
    - _Requirements: 5.1, 5.2, 5.7, 5.8_

  - [~] 7.4 Implement force safety and `--force` deletion
    - Create `src/emit/forceSafety.ts` with pure `checkForceTarget(resolved, ctx)` (filesystem root, home equality, cwd or ancestor of cwd, ancestor-or-equal of the SWF's directory, Windows case folding, reason strings from the design). In `emit.ts`, resolve symbolic links on the deepest existing ancestor, refuse unsafe targets with `UnsafeForceTargetError` before deleting anything, and with `--force` remove only direct entries with `fs.rm(entry, { recursive: true, force: true })` so links are removed and not followed.
    - Add example tests on temp directories: `--force` absent leaves a populated directory byte-identical; `--force` empties but keeps the directory; a symlink inside the directory is removed and its target survives (skip creating the link with a clear failure message if the platform denies it); unsafe paths are refused.
    - _Requirements: 5.8, 5.9, 5.10, 10.11_

- [x] 8. Runtime primitives
  - [x] 8.1 Add the clock and render backend interfaces
    - Create `template/runtime/clock.ts` (`Clock`, `ManualClock`) and `template/runtime/backend.ts` (`RenderBackend`, `NodeHandle`, `ShapeBounds`) as in the design.
    - _Requirements: 6.1, 6.2_

  - [x] 8.2 Add the script queue and hit testing
    - Create `template/runtime/scriptQueue.ts` (enqueue, drain, non-re-entrant, lookup at dequeue time).
    - Create `template/runtime/hitTest.ts`: pure `hitTest(root, x, y)` over a minimal structural interface (transform fields, visible, children, optional shape bounds), topmost first, inverse transform into local space.
    - _Requirements: 7.12, 7.13, 7.14, 8.2, 8.5_

- [ ] 9. Flash API shim
  - [~] 9.1 Implement events, DisplayObject, DisplayObjectContainer and Sprite
    - Create `template/shim/events.ts` (`Event`, `MouseEvent`, `EventDispatcher` with snapshot dispatch, registration order, duplicate listener registered once), `template/shim/DisplayObject.ts` (alpha clamped to 0..1, `parent`, `name` default `''`, width and height), `template/shim/Sprite.ts` (`numChildren`, `addChild` appends, `removeChild`, `getChildByName`).
    - _Requirements: 7.1, 7.2, 7.4, 7.8_

  - [~] 9.2 Implement MovieClip and the internal API
    - Create `template/shim/MovieClip.ts` and `template/shim/internal.ts`: `play`, `stop`, `gotoAndPlay`, `gotoAndStop` (valid frame or label, otherwise unchanged state and one `console.warn` with the value), `currentFrame`, `totalFrames`, `currentLabels`, `addFrameScript(...pairs)` with 0-based indices (out-of-range index registers nothing and warns), per-instance state only, `withConstructionContext`, child attach and detach, instance-name property exposure (`Reflect.set`, removal only if still pointing at the child), a clip outside a context has one empty frame. Goto methods render the target frame at once and enqueue the target script through the script queue.
    - Create `template/shim/index.ts` re-exporting the public surface only (not the internal module).
    - _Requirements: 7.3, 7.5, 7.6, 7.7, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 7.17_

  - [~] 9.3 Write property test for the MovieClip state machine
    - Create `test/property/movieClipMachine.test.ts` with generators `test/property/gen/genClipOps.ts`. Compare `(currentFrame, playing)` with a reference state machine after each of `play`, `stop`, `gotoAndPlay(x)`, `gotoAndStop(x)` and tick, where `x` is valid, a label, out of range or an unknown label. Check invalid `x` leaves state unchanged with one warning containing `x`, and that parent and sibling clips are unaffected.
    - **Property 15: MovieClip frame and play-state transitions follow a reference machine**
    - **Validates: Requirements 6.12, 7.3, 7.5, 7.6, 7.7, 7.16**

- [ ] 10. Player
  - [~] 10.1 Implement the Player, display-list reconciliation and instance creation
    - Create `template/runtime/stageTree.ts` and `template/runtime/player.ts` with `PlayerOptions`, `Player`, fixed-step accumulator (epsilon `1e-9`, `maxCatchUpFrames` default 5), the frame step from the design (advance only if playing and `totalFrames > 1`, render on change, `ENTER_FRAME` to every clip every tick, enqueue and drain the frame script only when a frame was entered, step children that existed before the tick), reconcile by depth with identity reuse for same `(depth, symbolId)`, matrix decomposition, colour transform application through the backend, skipping entries whose shape bounds are missing, class instantiation through the registry and construction context, binding of named children before the frame-1 script, `dispatchClick` using `hitTest` with bubbling to ancestors.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.9, 6.10, 6.11, 6.12, 7.9, 7.10, 7.12, 8.2, 8.4, 8.5, 8.6_

  - [~] 10.2 Write unit and property test for stepping
    - Create `test/property/stepping.test.ts` using `ManualClock` and a fake backend (`test/support/fakeBackend.ts`). First an example test: N frames (2 to 10) at a given Frame_Rate advance exactly one frame per interval and return to frame 1 on the next tick. Then the property over frame rates, clock increments, nesting and play/stop configurations.
    - **Property 13: Stepping advances exactly one frame per interval and loops**
    - **Validates: Requirements 6.2, 6.3, 6.10, 6.11, 10.4**

- [ ] 11. Click handler and oracle test
  - [~] 11.1 Hand-translate `LeftButton` and `RightButton` from the decompiled scripts
    - Read `test/fixtures/clickgoto/LeftButton.as` and `RightButton.as` (the FFDec output, not `samples/clickgoto/original-source`). Create `handwritten/clickgoto/LeftButton.ts` and `handwritten/clickgoto/RightButton.ts` that extend `MovieClip`, register the click listener, call `stop()`, drop `EventWatcher`, `trace` and `[Embed]`, and use arrow-function fields for `clicked`. No `_loc<N>_` identifiers. Import the shim as `'../shim'` (the path used in the emitted `src/`).
    - Make these files resolvable in the repo: add a `tsconfig.handwritten.json` with `rootDirs` of `handwritten/clickgoto` and `template/src`, and a Vitest `resolve.alias` for imports of `../shim` from `handwritten/`. Add a `typecheck:handwritten` script.
    - _Requirements: 8.1, 8.3_

  - [~] 11.2 Add the provenance parser and the repository provenance test
    - Create `test/support/provenance.ts` with `validateProvenance(text, { clickSample })` and `parseExpectedState(text)` for the Expected_State table in `PROVENANCE.md` (frames within 1..total, playing or stopped), including the licence allow-list and `OR` rule.
    - Create `test/unit/provenance.test.ts` that walks every `.swf` under `samples/`, fails naming the file and field when the note is missing or invalid, fails when no Click_Sample exists or its Expected_State is invalid. Also assert no `_loc<N>_` in `handwritten/` and no LLM client in `package.json` dependencies.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.7, 10.9, 10.10_

  - [~] 11.3 Write the click oracle test
    - Create `test/unit/clickOracle.test.ts`. Build the Click_Sample scene from the fixtures through `readUnpacked` and `convertModel` (or a committed fixture model), create a `Player` with the fake backend, `ManualClock`, and a registry of the real handwritten `LeftButton` and `RightButton`. Drive the Expected_State rows parsed from `PROVENANCE.md`: start state, click inside `l_button`, reset, click inside `r_button`, one tick after the second click shows the looping behaviour, a click outside every object changes nothing, and each button's placement equals (143.5, 270) and (415, 272.5).
    - Use `parseExpectedState` as the oracle. Do not hard-code the table.
    - _Requirements: 1.4, 7.10, 8.2, 8.3, 8.4, 8.5, 10.4_

- [ ] 12. Pixi adapter
  - [~] 12.1 Implement the PixiJS render backend
    - Create `template/runtime/pixi/pixiBackend.ts` (the only file importing `pixi.js`) implementing `RenderBackend`: `loadShape` builds a `Graphics` from the SVG text and returns bounds shifted into shape-origin coordinates, `createShape` places a clone at `(-origin.x, -origin.y)` using the sign recorded in `FINDINGS.md`, transforms, alpha, visibility, colour multiplier (tint and alpha), `showError` writing an on-page element. Warn once for colour-transform offsets.
    - Run `npm run typecheck:template`.
    - _Requirements: 6.1, 6.4, 6.7_

  - [~] 12.2 Implement the browser boot in `template/src/main.ts`
    - Fetch `assets/scene.json`, `parseScene`, load all shapes through the backend, create the `Application` with the scene stage size and background, create the `Player` with the class registry from `./classes`, run the `requestAnimationFrame` loop with `performance.now()` as the clock, convert `pointerdown` to stage coordinates and call `player.dispatchClick`. On scene failure show the error and render no frames.
    - Run `npm run typecheck:template`.
    - _Requirements: 6.1, 6.2, 6.6, 6.7, 8.2_

- [ ] 13. Pipeline glue
  - [~] 13.1 Implement `runPipeline`
    - Create `src/pipeline/pipeline.ts` with `PipelineStages`, `runPipeline(args, stages, io)` returning exit codes 0, 1, 2. Pre-check the SWF path and output directory writability (exit 2, no stage run), run unpack, convert, emit in order, print progress lines and `Done: <absolute output dir>`, print `error [<stage>]: <message>` on failure and skip later stages, add `untranslated-class` entries for linked classes without a handwritten translation, write `unsupported-features.json` into the output directory after a successful emit. Create a work directory with `mkdtemp` and delete it unless `--keep-work`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [~] 13.2 Implement the CLI
    - Create `src/pipeline/cli.ts` with `parseArgs` options `--force`, `--work-dir`, `--keep-work`, `--ffdec`, `--handwritten`. Resolve the handwritten directory by `handwritten/<parent directory name of the SWF>/` when the option is absent. Wire real stages, load template and handwritten files, pass `--force` to the Emitter (its deletion and safety checks come from Task 7.4), set `process.exitCode`.
    - Run `npm run pipeline -- samples/clickgoto/test.swf out/clickgoto --force` and confirm it exits 0 and writes the project.
    - _Requirements: 1.6, 9.1, 9.2, 9.8_

- [~] 14. Checkpoint - Sample runs in the browser
  - Ensure all tests pass, ask the user if questions arise. Run `npm test -- --run` and `npm run typecheck`, then `npm run pipeline -- samples/clickgoto/test.swf out/clickgoto --force`.
  - In `out/clickgoto`, run `npm install`, then `npm run typecheck` and `npm run build`.
  - Ask the user to start the project manually in their own terminal, with `npm run dev` or with `npm run build` followed by `npx vite preview`. The agent must not start or wait on a dev server or preview server.
  - Ask the user to open the printed URL and confirm each row of the Expected_State table in `samples/clickgoto/PROVENANCE.md`: at start both buttons stopped on frame 1; after clicking `l_button`, `l_button` stopped on frame 2 and `r_button` stopped on frame 1; after clicking `r_button`, `l_button` playing from frame 2 and `r_button` playing from frame 1 (colours alternating each frame); a click outside both buttons changes nothing; `l_button` sits at (143.5, 270) and `r_button` at (415, 272.5) on the 550 x 400 stage.
  - Wait for the user's visual confirmation. Nothing after this task is needed for this checkpoint.

- [ ] 15. Hardening
  - [~] 15.1 Add emitter write-failure cleanup
    - In `emit.ts`, on a write error remove the files already written by this run on a best-effort basis and throw `EmitWriteError(path, cause)`. Make the file writer injectable and add an example test with an injected failure that checks no success is reported and the written files are cleaned up.
    - _Requirements: 5.11_

  - [~] 15.2 Complete the Unpacker error paths
    - Ensure all errors from the design's Unpack error table are produced with the contents listed there: missing jar leaves the spawner uncalled and the work directory unchanged (2.3), non-zero exit carries code and ANSI-stripped stderr (2.4), timeout kills the process (2.5), AS2-only SWF stops before the export (2.6), invalid signature or unreadable path starts no process (2.7), missing exports listed by name (2.8), unsupported XML major (2.9), missing header values (2.10), missing `java` (`JavaNotFoundError`).
    - Add example tests with the injected fake spawner and fake timers; AS2 and version cases use small hand-edited copies of the fixture XML head.
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [~] 15.3 Complete the Converter error paths
    - Ensure malformed SVG names the file and writes nothing (3.4), missing or zero-byte SVG names the character id (3.5), unknown symbol id names id, sprite, frame and depth and leaves no `scene.json` (4.7), malformed frame data names sprite and frame and writes no scene (4.9), cycles and duplicate symbol-class ids are errors. Confirm the morph, text, sound, button, filter, mask and video reporting and the dropped-placement entries (3.3, 3.7, 3.8) and the `unbound-instance` entry (8.7).
    - Add small example tests for each error class and message with hand-built `TagsModel` values and temp staging directories.
    - _Requirements: 3.3, 3.4, 3.5, 3.7, 3.8, 4.7, 4.9, 8.7_

  - [~] 15.4 Complete unsupported-feature reporting and refusal handling in the pipeline
    - Write `unsupported-features.json` after a failure that occurs once Convert has completed (not for the Emitter refusals). When the Emitter refuses a non-empty directory or an unsafe `--force` target, print the list to standard error and write nothing in the output directory. Confirm exit code 2 for invalid SWF or output paths with no stage run, and that a failed stage skips later stages.
    - Add example tests with stub stages for each of these paths.
    - _Requirements: 9.4, 9.5, 9.6, 9.8, 9.9_

  - [~] 15.5 Complete the runtime error overlay
    - In `template/src/main.ts` and the Pixi backend: invalid or unreachable `scene.json` shows an error naming Scene_JSON and renders no frame (6.6); a failed SVG load shows an error naming the asset and playback does not start (6.7); a placement of an asset that is not loaded is skipped, the others render, and the error names the asset (6.8); an unbindable named instance leaves the property unset and loading continues (8.6).
    - Add example tests with the fake backend covering the three load failures.
    - _Requirements: 6.6, 6.7, 6.8, 8.6_

  - [~] 15.6 Close remaining shim and runtime coverage gaps
    - Review requirements 6 to 8 against the code and fix gaps: `numChildren`, `getChildByName` null, alpha clamping, `addFrameScript` odd-argument and non-function warnings, `removeEventListener` from inside a dispatch, click bubbling with `currentTarget`, scripted children drawn above timeline children, skewed matrix and offset warnings. Add an example test for each gap fixed.
    - _Requirements: 6.4, 6.5, 6.9, 7.1, 7.2, 7.4, 7.8, 7.15, 7.17_

- [ ] 16. Optional property and unit tests
  - [ ]* 16.1 Write property test for symbol resolution
    - **Property 3: Every referenced symbol resolves or the converter errors naming it**
    - **Validates: Requirements 3.5, 4.7, 10.3**

  - [ ]* 16.2 Write property test for symbol-table metadata
    - **Property 5: Symbol-table metadata mirrors the model**
    - **Validates: Requirements 4.2, 4.4, 4.5, 4.12**

  - [ ]* 16.3 Write property test for shape conservation
    - **Property 6: Shape conversion conserves shapes**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.6**

  - [ ]* 16.4 Write property test for unsupported-feature reporting
    - **Property 7: Unsupported features are reported, never silently dropped**
    - **Validates: Requirements 3.3, 3.7, 3.8, 8.7**

  - [ ]* 16.5 Write property test for malformed frame data
    - **Property 8: Malformed frame data is reported with its location**
    - **Validates: Requirements 4.9**

  - [ ]* 16.6 Write property test for provenance validation
    - **Property 9: Provenance validation accepts exactly the valid notes**
    - **Validates: Requirements 1.2, 1.4, 1.5, 10.9, 10.10**

  - [ ]* 16.7 Write property test for unpack parsers
    - **Property 10: Unpack parsers are correct on any input**
    - **Validates: Requirements 2.2, 2.7, 4.12**

  - [ ]* 16.8 Write property test for emit planning determinism
    - **Property 11: Emit planning is deterministic**
    - **Validates: Requirements 5.7**

  - [ ]* 16.9 Write property test for force safety
    - **Property 12: Force safety refuses exactly the unsafe targets**
    - **Validates: Requirements 5.10, 10.11**

  - [ ]* 16.10 Write property test for display-list reconciliation
    - **Property 14: Rendered display list reconciles with the scene and preserves identity**
    - **Validates: Requirements 6.4, 6.5, 6.8, 6.9, 7.17**

  - [ ]* 16.11 Write property test for event dispatch
    - **Property 16: Event dispatch follows registration order and snapshot semantics**
    - **Validates: Requirements 7.4, 7.8, 7.9**

  - [ ]* 16.12 Write property test for frame scripts
    - **Property 17: Frame scripts run once, in order, and never re-entrantly**
    - **Validates: Requirements 7.11, 7.12, 7.13, 7.14, 7.15, 8.4**

  - [ ]* 16.13 Write property test for DisplayObject and Sprite invariants
    - **Property 18: DisplayObject and Sprite invariants**
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 16.14 Write property test for click delivery
    - **Property 19: Clicks reach exactly the listeners on the hit chain**
    - **Validates: Requirements 7.10, 8.2, 8.5**

  - [ ]* 16.15 Write additional unit tests for emitter output
    - Check required files exist in the plan, `tsconfig` strict, no range operators in dependency versions, and that two `planEmit` runs give identical output.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7_

- [ ] 17. End-to-end smoke test
  - [~] 17.1 Write the e2e smoke test
    - Create `test/e2e/pipeline.e2e.test.ts`. In `beforeAll`, check that Java, `tools/ffdec/ffdec-cli.jar` and at least one Sample_SWF exist, and throw an error naming the missing dependency otherwise (never skip, never pass). Run the pipeline on every `samples/**/*.swf` into a temp directory, then `npm install --no-audit --no-fund`, `npm run typecheck` and `npm run build` in each emitted project, requiring exit code 0 and a build output containing `index.html` and a JavaScript file. Run the pipeline twice and compare the two output trees byte for byte. Use a 10 minute timeout and a shared install cache so identical pinned dependencies install once.
    - _Requirements: 4.8, 5.5, 5.6, 5.7, 9.1, 10.5, 10.6, 10.8_

- [~] 18. Final checkpoint - Ensure all tests pass
  - Run `npm test -- --run` (all required tests, including the click oracle, provenance and e2e tests, plus any optional tests present), `npm run typecheck`, `npm run typecheck:template` and `npm run typecheck:handwritten`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Required tests: Properties 1, 2, 4, 13, 15, the click oracle test, the provenance repository test and the e2e smoke test.
- Task 2 and Task 3 are a gate: parsers in Tasks 4 and 5 depend on the verified names recorded in `test/fixtures/clickgoto/FINDINGS.md` and `src/convert/ffdecXml.ts`.
- Task 14 is a manual browser checkpoint. The agent must not block on a dev or preview server.
- FFDec is GPLv3 and is only run as a separate process. It is never committed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["4.1", "5.1", "6.1", "7.1", "7.2", "8.1"] },
    { "id": 5, "tasks": ["4.2", "5.2", "6.2", "8.2", "9.1"] },
    { "id": 6, "tasks": ["4.3", "5.3", "6.3", "6.4", "9.2"] },
    { "id": 7, "tasks": ["5.4", "6.5", "6.6", "9.3", "10.1"] },
    { "id": 8, "tasks": ["6.7", "6.8", "10.2", "11.1", "11.2", "12.1"] },
    { "id": 9, "tasks": ["7.3", "11.3"] },
    { "id": 10, "tasks": ["7.4", "12.2", "13.1"] },
    { "id": 11, "tasks": ["13.2"] },
    { "id": 12, "tasks": ["15.2", "15.3", "15.5", "15.6"] },
    { "id": 13, "tasks": ["15.1", "15.4"] },
    { "id": 14, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.7", "16.8", "16.9", "16.10", "16.11", "16.12", "16.13", "16.14", "16.15", "17.1"] }
  ]
}
```
