# Matrix Scale Decimal Fix Bugfix Design

## Overview

`parseMatrix` in `src/convert/ffdecXml.ts` divides `scaleX`, `scaleY`, `rotateSkew0` and `rotateSkew1` by 65536 (`FIXED_16_16`), assuming 16.16 fixed point. FFDec 26.4.0 writes these as plain decimals (`scaleX="0.59999084"`), as seen on `samples/tweendemo/test.swf` (`PROVENANCE.md`, "Matrix convention"). Any scaled or rotated placement therefore converts to a near-zero scale, and the tweened shape at depth 10 is invisible.

The fix removes the division, changes the fallback used when `scaleX`/`scaleY` is missing from `FIXED_16_16` to `1`, and keeps the `hasScale=false` and `hasRotate=false` defaults. Alongside the code change, the work does four things:

- Commits FFDec fixtures for tweendemo under `test/fixtures/tweendemo/` and adds tests for scale, rotation, labels and removal.
- Updates the `FFDEC_XML` comments. Names that occur in the fixture are marked verified with a line reference. Names that do not occur stay `UNVERIFIED`.
- Checks the Pixi backend path for matrix and colour transform. Gaps are reported to the user before anything beyond this spec's scope is fixed.
- Leaves `clickgoto` output unchanged.

The change is minimal. Only matrix field parsing changes in production code.

## Glossary

- **Bug_Condition (C)**: A `<matrix>` element with `hasScale="true"` or `hasRotate="true"`. Only these paths read the scale and rotate fields.
- **Property (P)**: For such elements, `a = scaleX`, `d = scaleY`, `b = rotateSkew0`, `c = rotateSkew1` as plain decimals. A missing scale field falls back to 1 and a missing rotate field to 0.
- **Preservation**: Behaviour for matrices without scale or rotate stays identical. This covers translation in twips, the absent matrix and colour transform cases, the XML version check, and `clickgoto` output.
- **parseMatrix**: Function in `src/convert/ffdecXml.ts` that turns the attributes of a `<matrix>` element into a `MatrixModel` (`a b c d txTwips tyTwips`).
- **FIXED_16_16**: Constant `65536` in `ffdecXml.ts`. Currently the divisor and the scale fallback. It is removed if no other use remains.
- **CXFORM_UNIT**: Constant `256`. Colour transform multiplier terms are divided by it. It is unrelated to this bug and stays.
- **FFDEC_XML**: Table of FFDec XML names in `ffdecXml.ts`, each documented as verified or `UNVERIFIED`.
- **Matrix convention**: `[a, b, c, d, tx, ty]` with `a = scaleX`, `b = rotateSkew0`, `c = rotateSkew1`, `d = scaleY`. This follows `PROVENANCE.md`.

## Bug Details

### Bug Condition

The bug manifests whenever a placement's `<matrix>` has `hasScale="true"` or `hasRotate="true"`. `parseMatrix` reads the attribute with `attrNum` and then divides by `FIXED_16_16`. The fallback for a missing scale attribute is also `FIXED_16_16`, which only gives 1 because of the division, so removing the division alone would make a missing scale parse as 65536. The fallback must change to 1 in the same edit.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type MatrixElement (FFDec <matrix> element)
  OUTPUT: boolean

  RETURN (X.hasScale = true OR X.hasRotate = true)
END FUNCTION
```

### Examples

- `hasScale="true" scaleX="0.59999084"`: expected `a = 0.59999084`, actual `a ≈ 0.0000092`.
- `hasRotate="true" rotateSkew0="0.9781952"`: expected `b = 0.9781952`, actual `b ≈ 0.0000149`.
- tweendemo frame 1, depth 10: expected scale 0.6 and no rotation. Actual scale is near zero.
- tweendemo frame 43, depth 10: expected about `[-1.4, 0, 0, -1.4, 490, 90]` (180 degrees at scale 1.4). Actual values are near zero.
- `hasScale="true"` with no `scaleX` attribute: expected `a = 1`. After a naive removal of the division, `a` would be 65536. This is a regression trap.
- `hasScale="false"`: `a = d = 1`. Not affected.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `hasScale="false"` gives `a = d = 1` (3.1).
- `hasRotate="false"` gives `b = c = 0` (3.2).
- `translateX` and `translateY` are read as integer twips. Division by 20 happens only when converting to pixels (3.3).
- `samples/clickgoto/test.swf` produces the same scene output, because all its placements are plain translations (3.4).
- A placement without a `matrix` child or colour transform child leaves those fields absent (3.5).
- A non-4 XML export major version is still rejected with the XML version error (3.6).
- `npm run typecheck` and `npm test -- --run` pass, and the work is committed locally and not pushed (3.7).

**Scope:**
All matrices with neither scale nor rotate are unaffected. This includes:
- Plain translations, as in `clickgoto`.
- Placements without a matrix.
- Colour transform parsing (`CXFORM_UNIT` division is unchanged).

## Hypothesized Root Cause

1. **Wrong format assumption (confirmed by fixture)**: The code assumed SWF-spec 16.16 fixed point. FFDec's XML export converts to decimals itself. The assumption was recorded as `UNVERIFIED` because `clickgoto` has `hasScale=false` everywhere, so the path was never exercised.
2. **Coupled fallback**: The missing-attribute fallback reuses `FIXED_16_16`, so the divisor and the default are coupled. Fixing one without the other introduces a second bug.
3. **No test coverage**: No fixture had a scaled or rotated placement, so nothing could catch the mistake.

Other hypotheses, such as the decomposition in `template/runtime/stageTree.ts` or the scene JSON writer rescaling values, are ruled out for the parse step by the counterexample (`a ≈ 0.0000092` comes directly from the division). They are still checked end to end by the tweendemo test.

## Correctness Properties

Property 1: Bug Condition - Matrix fields are plain decimals

_For any_ `<matrix>` element where the bug condition holds (isBugCondition returns true), the fixed `parseMatrix` SHALL return `a = scaleX` and `d = scaleY` when `hasScale` is true (1 when the attribute is missing), and `b = rotateSkew0` and `c = rotateSkew1` when `hasRotate` is true (0 when the attribute is missing), with no division by 65536. The tweendemo conversion SHALL give scale 0.6 and no rotation at depth 10 on frame 1, about `[-1.4, 0, 0, -1.4, 490, 90]` on frame 43, labels `start`=1, `middle`=24, `gone`=44, and no depth 10 entry on frame 44.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-scaled, non-rotated matrices are unchanged

_For any_ `<matrix>` element where the bug condition does NOT hold (isBugCondition returns false), the fixed `parseMatrix` SHALL produce the same result as the original: `a = d = 1`, `b = c = 0`, translation in twips unchanged. `clickgoto` scene output SHALL be unchanged, missing matrix and colour transform children SHALL stay absent, and a non-4 XML major SHALL still be rejected.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

Property 3: Documentation and backend check - verified names and reported gaps

_For any_ name in `FFDEC_XML` that occurs in the tweendemo fixture (matrix scale and rotate fields, colour transform fields, `FrameLabelTag` name attribute, `RemoveObject2Tag` depth attribute), the comment SHALL say verified with a fixture line reference. _For any_ name that does not occur, the comment SHALL remain `UNVERIFIED`. For any scene node with a matrix and colour transform, the Pixi backend SHALL apply rotation and scale from the matrix and alpha from the colour transform, and any gap found SHALL be reported before being fixed beyond this spec's scope.

**Validates: Requirements 2.4, 2.5**

## Fix Implementation

### Changes Required

**File**: `src/convert/ffdecXml.ts`

**Function**: `parseMatrix`

**Specific Changes**:
1. **Remove the division**: Return `attrNum(attrs, m.scaleX)` directly for `a`, likewise for `b`, `c`, `d`.
2. **Fix the fallback**: When `hasScale` is true and `scaleX` or `scaleY` is missing, use `1`. When `hasRotate` is true and a skew is missing, keep `0`.
   ```ts
   a: hasScale ? (attrNum(attrs, m.scaleX) ?? 1) : 1,
   b: hasRotate ? (attrNum(attrs, m.rotateSkew0) ?? 0) : 0,
   c: hasRotate ? (attrNum(attrs, m.rotateSkew1) ?? 0) : 0,
   d: hasScale ? (attrNum(attrs, m.scaleY) ?? 1) : 1,
   ```
3. **Remove `FIXED_16_16`** if nothing else uses it. Check with a search before deleting.
4. **Update `FFDEC_XML` comments**: Replace the `UNVERIFIED` and "Fixed-point 16.16 assumed" text for `scaleX`, `scaleY`, `rotateSkew0`, `rotateSkew1` with "Verified on FFDec 26.4.0 (fixture line N): plain decimal, no division". Do the same for the colour transform fields (multiplier terms divided by 256), `timeline.frameLabel` and `frameLabelNameAttr`, `remove.removeObject2` and `remove.depth`, each using real line numbers from the committed fixture. Names not present in the fixture (`removeObject`, `placeObject`, `placeObject3`, `clipDepth`, filter names) stay `UNVERIFIED`. The `colorTransform.element` name is verified only if the fixture contains it. Names are checked against the captured fixture, not assumed. Per `git-workflow.md`, if a task would need a name still marked `UNVERIFIED` to be trusted, stop and ask.

**Fixtures**: `test/fixtures/tweendemo/` is created from `samples/tweendemo/test.swf` using the same FFDec commands that produced `test/fixtures/clickgoto/` (`-swf2xml` for `structure.xml`, plus the shapes, scripts and `symbols.csv` exports). The fixture is read-only test input. It does not modify `samples/`. The SWF itself is already under `samples/` with a `PROVENANCE.md`. Fixtures come from a real FFDec run. They are not hand-edited.

**Pixi backend check (report only)**: Read `template/runtime/stageTree.ts` (`decomposeMatrix`), `template/runtime/player.ts` (`applyMatrix`, `applyColor`) and `template/runtime/pixi/pixiBackend.ts` (`setTransform`, `setColorTransform`, `setAlpha`). Confirm that:
- Scale and rotation reach `c.scale.set` and `c.angle`.
- Alpha multiplier from the colour transform reaches `colorAlpha`.
- A 180 degree rotation at scale 1.4 (`[-1.4, 0, 0, -1.4, ...]`) decomposes to a sensible scale and rotation, and a dropped skew is reported.
Any gap is listed in the task summary and put to the user. It is not fixed unless it is inside this spec's scope.

**Tests**: Add `test/unit/ffdecXmlMatrix.test.ts` and `test/unit/tweendemoConvert.test.ts`, and a `fast-check` property test under `test/property/`.

## Testing Strategy

### Validation Approach

First surface the defect on the unfixed code with tests that fail, then apply the fix and confirm the same tests pass alongside the preservation tests.

### Exploratory Bug Condition Checking

**Goal**: Show the defect on unfixed code and confirm the root cause. If a test passes unexpectedly, the hypothesis is wrong and must be revisited.

**Test Plan**: Parse small hand-written `<matrix>` attribute sets, and the real tweendemo fixture, through the structure parser. Run on unfixed code.

**Test Cases**:
1. **Scale value**: `hasScale="true" scaleX="0.59999084" scaleY="0.59999084"` gives `a = d = 0.59999084` (fails on unfixed code with about 0.0000092).
2. **Rotate value**: `hasRotate="true" rotateSkew0="0.9781952" rotateSkew1="-0.2"` gives `b = 0.9781952`, `c = -0.2` (fails on unfixed code).
3. **Tweendemo frame 1**: depth 10 matrix has `a = d ≈ 0.6` and `b = c = 0` (fails on unfixed code).
4. **Missing attribute**: `hasScale="true"` with no `scaleX` gives `a = 1` (passes on unfixed code, and must still pass after the fix, which guards against the naive edit).

**Expected Counterexamples**:
- Scale and skew values are about 1/65536 of the XML value.
- Cause: the division by `FIXED_16_16`.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed function gives the expected behaviour.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := parseMatrix_fixed(X)
  ASSERT result.a = (X.hasScale ? X.scaleX ?? 1 : 1)
     AND result.d = (X.hasScale ? X.scaleY ?? 1 : 1)
     AND result.b = (X.hasRotate ? X.rotateSkew0 ?? 0 : 0)
     AND result.c = (X.hasRotate ? X.rotateSkew1 ?? 0 : 0)
END FOR
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed function gives the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT parseMatrix_original(X) = parseMatrix_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing with `fast-check` suits this because translation values and flag combinations are a wide domain, and it catches odd cases such as negative or zero twips.

**Test Plan**: Capture the `clickgoto` scene output on the unfixed code first (or compare against the existing committed expectation), then confirm it is identical after the fix.

**Test Cases**:
1. **Translation only**: arbitrary integer twips with both flags false give `a = d = 1`, `b = c = 0`, and unchanged `txTwips`/`tyTwips`.
2. **clickgoto scene**: converted scene JSON is byte-identical before and after.
3. **Absent children**: placements without `matrix` or `colorTransform` keep those fields undefined.
4. **XML version**: a dump with major version other than 4 still throws the XML version error.

### Unit Tests

- `parseMatrix` for scale only, rotate only, both, neither, and missing attributes.
- Tweendemo parse: depth 10 scale 0.6 on frame 1, about `[-1.4, 0, 0, -1.4, 490, 90]` on frame 43, labels `start`=1, `middle`=24, `gone`=44, no depth 10 on frame 44.
- Colour transform of the fixture: multiplier terms divided by 256 (for example 256 gives 1, 77 gives about 0.30).
- A check that every name marked verified in `FFDEC_XML` occurs in the fixture, where practical.

### Property-Based Tests

- Random finite decimals for scale and skew with the flags true: output equals input.
- Random flag combinations with random twips: unchanged outputs for the non-buggy paths.
- Random missing-attribute combinations: scale falls back to 1 and skew to 0.

### Integration Tests

- Convert `samples/tweendemo/test.swf` fixtures end to end into scene JSON and check the depth 10 entries on frames 1, 24, 43 and 44.
- Convert `clickgoto` and compare with the existing expected output.
- Run `decomposeMatrix` on the frame 43 matrix and check scale 1.4 with 180 degrees rotation (or the equivalent negative scale), no skew warning.
- Pixi backend check as described above, using the existing fake backend in `test/support/fakeBackend.ts` for the automated part. The report of any gap in the real Pixi backend is manual.
