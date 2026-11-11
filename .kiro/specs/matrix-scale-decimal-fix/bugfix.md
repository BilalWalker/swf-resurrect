# Bugfix Requirements Document

## Introduction

The structure parser in `src/convert/ffdecXml.ts` treats the matrix fields `scaleX`, `scaleY`, `rotateSkew0` and `rotateSkew1` as 16.16 fixed-point integers and divides them by 65536. FFDec 26.4.0 writes these fields as plain decimals (for example `scaleX="0.59999084"`, `rotateSkew0="0.9781952"`), as verified on `samples/tweendemo/test.swf` (see its `PROVENANCE.md`, section "Matrix convention"). Every scaled or rotated placement therefore converts with a scale near zero, so tweened shapes collapse to almost nothing. The same sample also shows that several FFDec XML names marked `UNVERIFIED` (colour transform fields, `FrameLabelTag` name, `RemoveObject2Tag` depth) are now observable and need to be confirmed and marked verified, and the Pixi backend must be checked for applying the corrected values.

Bug condition and property:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type MatrixElement (FFDec <matrix> element)
  OUTPUT: boolean

  RETURN (X.hasScale = true OR X.hasRotate = true)
END FUNCTION
```

```pascal
// Property: Fix Checking - Matrix fields are plain decimals
FOR ALL X WHERE isBugCondition(X) DO
  result ← parseMatrix'(X)
  ASSERT result.a = X.scaleX (if hasScale, else 1)
     AND result.d = X.scaleY (if hasScale, else 1)
     AND result.b = X.rotateSkew0 (if hasRotate, else 0)
     AND result.c = X.rotateSkew1 (if hasRotate, else 0)
END FOR
```

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT parseMatrix(X) = parseMatrix'(X)
END FOR
```

Counterexample: a placement with `hasScale="true"` and `scaleX="0.59999084"` parses to `a = 0.0000091` instead of `0.59999084`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a matrix has `hasScale="true"` THEN the system divides `scaleX` and `scaleY` by 65536, producing a scale near zero (for example 0.6 becomes about 0.0000092)

1.2 WHEN a matrix has `hasRotate="true"` THEN the system divides `rotateSkew0` and `rotateSkew1` by 65536, producing rotation and skew terms near zero (for example 0.9781952 becomes about 0.0000149)

1.3 WHEN `samples/tweendemo/test.swf` is converted THEN the system emits scene JSON in which the tweened shape at depth 10 is effectively invisible, and no test covers its scale, rotation, frame labels or removal

1.4 WHEN the FFDec XML names for matrix scale and rotate fields, colour transform fields, `FrameLabelTag` name and `RemoveObject2Tag` depth are read THEN the system documents them as `UNVERIFIED` and, for the matrix fields, as 16.16 fixed-point, although the tweendemo dump contains them

### Expected Behavior (Correct)

2.1 WHEN a matrix has `hasScale="true"` THEN the system SHALL use `scaleX` and `scaleY` as plain decimal values, without dividing by 65536 (for example `scaleX="0.59999084"` gives `a = 0.59999084`)

2.2 WHEN a matrix has `hasRotate="true"` THEN the system SHALL use `rotateSkew0` as `b` and `rotateSkew1` as `c` as plain decimal values, without dividing by 65536, following the convention `[a, b, c, d, tx, ty]` with `a = scaleX`, `b = rotateSkew0`, `c = rotateSkew1`, `d = scaleY`

2.3 WHEN `samples/tweendemo/test.swf` is converted THEN the system SHALL produce, from FFDec fixtures committed in `test/fixtures/tweendemo/`, a depth 10 matrix of scale 0.6 with no rotation on frame 1 and about `[-1.4, 0, 0, -1.4, 490, 90]` on frame 43, frame labels `start` = 1, `middle` = 24 and `gone` = 44, and no depth 10 entry on frame 44, each covered by an automated test

2.4 WHEN the verified names are documented in `FFDEC_XML` THEN the system SHALL mark as verified, with the fixture line reference, the matrix scale and rotate fields (stating they are plain decimals), the colour transform fields (stating multiplier terms are divided by 256), the `FrameLabelTag` name attribute and the `RemoveObject2Tag` depth attribute, and SHALL leave any name that does not occur in the fixture marked `UNVERIFIED`

2.5 WHEN a scene node carries a matrix and a colour transform THEN the Pixi backend SHALL apply rotation and scale from the matrix and alpha from the colour transform, and any gap found SHALL be reported to the user before it is fixed beyond this spec's scope

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a matrix has `hasScale="false"` THEN the system SHALL CONTINUE TO use scale 1 for `a` and `d`

3.2 WHEN a matrix has `hasRotate="false"` THEN the system SHALL CONTINUE TO use 0 for `b` and `c`

3.3 WHEN a matrix has `translateX` and `translateY` THEN the system SHALL CONTINUE TO read them as integer twips and divide by 20 only when converting to pixels

3.4 WHEN `samples/clickgoto/test.swf` is converted THEN the system SHALL CONTINUE TO produce the same scene output as before, since all its placements are plain translations

3.5 WHEN a placement has no matrix child or no colour transform child THEN the system SHALL CONTINUE TO leave those fields absent on the parsed operation

3.6 WHEN the XML export major version is not 4 THEN the system SHALL CONTINUE TO reject the dump with an XML version error

3.7 WHEN the work is complete THEN the system SHALL CONTINUE TO pass `npm run typecheck` and `npm test -- --run`, and SHALL be committed locally per `.kiro/steering/git-workflow.md` without pushing
