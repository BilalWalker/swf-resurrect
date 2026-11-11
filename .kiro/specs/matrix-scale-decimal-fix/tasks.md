# Implementation Plan

## Overview

Fix `parseMatrix` so FFDec 26.4.0 matrix scale and skew fields are read as plain decimals. Order: capture fixtures, write failing exploration tests, write preservation tests, fix, update `FFDEC_XML` markers, report on the Pixi backend, checkpoint, then commit locally.

## Tasks

- [x] 1. Capture tweendemo fixtures from a real FFDec run
  - Run FFDec 26.4.0 (`java -jar tools/ffdec/ffdec-cli.jar`) on `samples/tweendemo/test.swf` with the same commands that produced `test/fixtures/clickgoto/`: `-swf2xml` for `structure.xml`, and `-export shape,script,symbolClass` for `shapes/`, `scripts/` and `symbols.csv`
  - Work in `.work/` first, strip ANSI colour codes from any captured text, then copy the results into `test/fixtures/tweendemo/`
  - Do not hand-edit the fixture files. Do not modify anything under `samples/`
  - Confirm `structure.xml` root has `_xmlExportMajor="4"` and contains the depth 10 placements, `FrameLabelTag` items (`start`, `middle`, `gone`) and the `RemoveObject2Tag` on frame 44
  - Add `test/fixtures/tweendemo/FINDINGS.md` noting the FFDec version, the commands run, and the line numbers in `structure.xml` of the matrix, colour transform, `FrameLabelTag` and `RemoveObject2Tag` items (used later by task 5)
  - Confirm `git check-ignore` does not match the fixture paths and that nothing under `tools/` or `.work/` is staged
  - _Requirements: 2.3, 2.4_

- [x] 2. Write bug condition exploration test
  - **Property 1: Bug Condition** - Matrix scale and rotate fields are plain decimals
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to matrices where `hasScale="true"` or `hasRotate="true"` (isBugCondition from design)
  - Add `test/unit/ffdecXmlMatrix.test.ts`: `hasScale="true" scaleX="0.59999084" scaleY="0.59999084"` gives `a = d = 0.59999084`; `hasRotate="true" rotateSkew0="0.9781952" rotateSkew1="-0.2"` gives `b = 0.9781952`, `c = -0.2`
  - Add a `fast-check` property under `test/property/`: random finite decimals with the flags true give output equal to input
  - Add `test/unit/tweendemoConvert.test.ts` reading `test/fixtures/tweendemo/`: depth 10 on frame 1 has `a = d ≈ 0.6`, `b = c = 0`; frame 43 about `[-1.4, 0, 0, -1.4, 490, 90]`; labels `start`=1, `middle`=24, `gone`=44; no depth 10 entry on frame 44
  - Add the missing-attribute case (`hasScale="true"` with no `scaleX` gives `a = 1`). This one is expected to PASS on unfixed code and guards against a naive removal of the division
  - Run on UNFIXED code. **EXPECTED OUTCOME**: scale, rotate and tweendemo scale/rotation tests FAIL (this is correct - it proves the bug exists)
  - Document counterexamples found (for example `a ≈ 0.0000092` instead of `0.59999084`)
  - Mark task complete when tests are written, run, and failure is documented. Do not commit a failing state; commit happens in task 8
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 3. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-scaled, non-rotated matrices are unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: `hasScale="false"` gives `a = d = 1`; `hasRotate="false"` gives `b = c = 0`; `translateX`/`translateY` pass through as integer twips
  - Observe on UNFIXED code: the converted `clickgoto` scene JSON (compare against the existing committed expectation, or record it before the fix)
  - Observe on UNFIXED code: placements without `matrix` or `colorTransform` leave those fields undefined; a non-4 XML export major throws the XML version error
  - Write `fast-check` property tests: arbitrary integer twips (including negative and zero) with both flags false give `a = d = 1`, `b = c = 0`, unchanged `txTwips`/`tyTwips`
  - Write example tests for clickgoto scene output, absent children, and the XML version error
  - Run tests on UNFIXED code. **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Fix `parseMatrix` plain decimal handling

  - [x] 4.1 Implement the fix
    - In `src/convert/ffdecXml.ts` `parseMatrix`, remove the division by `FIXED_16_16` for `scaleX`, `scaleY`, `rotateSkew0`, `rotateSkew1`
    - Change the scale fallback from `FIXED_16_16` to `1`, and keep the rotate fallback at `0`:
      `a: hasScale ? (attrNum(attrs, m.scaleX) ?? 1) : 1`, `b: hasRotate ? (attrNum(attrs, m.rotateSkew0) ?? 0) : 0`, and likewise for `c` and `d`
    - Search for other uses of `FIXED_16_16`; delete the constant only if none remain. Leave `CXFORM_UNIT` (256) unchanged
    - _Bug_Condition: isBugCondition(X) where X.hasScale = true OR X.hasRotate = true_
    - _Expected_Behavior: a = scaleX, d = scaleY, b = rotateSkew0, c = rotateSkew1 as plain decimals, fallbacks 1 and 0_
    - _Preservation: hasScale/hasRotate false defaults, twip translation, absent matrix/colour transform, XML version check, clickgoto output_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Matrix scale and rotate fields are plain decimals
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms bug is fixed), including the missing-attribute guard
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-scaled, non-rotated matrices are unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 3 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (no regressions, clickgoto output identical)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Verify and update `FFDEC_XML` markers
  - Check each name against `test/fixtures/tweendemo/structure.xml`. Do not assume
  - Mark as verified, with the fixture line reference from `FINDINGS.md`, only names that occur: matrix `scaleX`, `scaleY`, `rotateSkew0`, `rotateSkew1` (plain decimals, no division); colour transform fields (multiplier terms divided by 256); `FrameLabelTag` and its `name` attribute; `RemoveObject2Tag` and its `depth` attribute
  - Replace the old "Fixed-point 16.16 assumed" text for the matrix fields
  - Verify the `colorTransform.element` name only if the fixture contains it
  - Leave `removeObject`, `placeObject`, `placeObject3`, `clipDepth` and filter names marked `UNVERIFIED`
  - Add a unit test that every name marked verified occurs in the fixture, where practical. Add a colour transform test (256 gives 1, 77 gives about 0.30)
  - If a later task would need a name still marked `UNVERIFIED` to be trusted, stop and ask the user (git-workflow stop condition)
  - _Requirements: 2.4, 1.4_

- [x] 6. Pixi backend check (report only)
  - Read `template/runtime/stageTree.ts` (`decomposeMatrix`), `template/runtime/player.ts` (`applyMatrix`, `applyColor`) and `template/runtime/pixi/pixiBackend.ts` (`setTransform`, `setColorTransform`, `setAlpha`)
  - Confirm scale and rotation reach `c.scale.set` and `c.angle`, and that the colour transform alpha multiplier reaches `colorAlpha`
  - Check that `[-1.4, 0, 0, -1.4, ...]` decomposes to scale 1.4 with 180 degrees rotation (or the equivalent negative scale), with no skew warning
  - Add an automated test using `test/support/fakeBackend.ts` for the decomposition and alpha path. The real Pixi backend is checked by reading only
  - Do NOT change `template/` code. List any gap in the task summary and put it to the user before fixing anything beyond this spec's scope
  - _Requirements: 2.5_

- [x] 7. Checkpoint - Ensure all tests pass
  - Run `npm run typecheck` and `npm test -- --run`
  - Ask the user if questions arise, and present the Pixi backend report from task 6 before continuing
  - _Requirements: 3.7_

- [x] 8. Typecheck, test and commit locally
  - Run `npm run typecheck` and `npm test -- --run`. Both must pass. If either fails, fix it first; never commit a failing state
  - Run `git status` and stage by path only the files this work created or changed: `src/convert/ffdecXml.ts`, the new files under `test/unit/`, `test/property/` and `test/support/` (if touched), `test/fixtures/tweendemo/`, and `.kiro/specs/matrix-scale-decimal-fix/` (`.config.kiro`, `bugfix.md`, `design.md`, `tasks.md`, plus `tasks.meta.json` if present)
  - Never use `git add -A`, `git add .` or `git commit -a`. Confirm with `git diff --cached --name-only` that nothing under `tools/`, `node_modules/`, `out/`, `.work/` or `dist/` is staged, and that no SWF outside `samples/` is staged
  - Commit locally, following `.kiro/steering/git-workflow.md`. Message shape:
    ```
    Convert: read matrix scale and skew as plain decimals

    FFDec 26.4.0 writes scaleX, scaleY, rotateSkew0 and rotateSkew1 as
    decimals, but parseMatrix divided them by 65536, so tweened shapes
    collapsed. Remove the division and default a missing scale to 1.
    Add tweendemo fixtures from a real FFDec run, mark verified FFDEC_XML
    names with fixture line references. Verified with npm run typecheck
    and npm test -- --run. Pixi backend checked by reading only. Spec
    matrix-scale-decimal-fix, tasks 1 to 8.
    ```
  - No `Co-Authored-By`, no "Generated with" lines, no emoji. Never `git push`, amend, rebase or reset
  - _Requirements: 3.7_

## Notes

- Tasks 2 and 3 must run on unfixed code before task 4.1. Task 2 is expected to fail, task 3 is expected to pass.
- Task 6 is report only. Do not change `template/` code without asking the user.
- Task 8 commits locally only. Never push. Never commit anything under `tools/`, `.work/`, `node_modules/`, `out/` or `dist/`.
- FFDec is GPLv3 and is only run as a separate process. It is never committed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5", "6"] },
    { "id": 4, "tasks": ["7"] },
    { "id": 5, "tasks": ["8"] }
  ]
}
```
