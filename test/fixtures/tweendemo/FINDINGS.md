# tweendemo FFDec findings

Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`), Java 17.0.12, from `samples/tweendemo/test.swf` (SHA-256 `500314ba...53a7d6d`, matches `PROVENANCE.md`). Used by spec `matrix-scale-decimal-fix`.

## Capture

Run into `.work/tween/` (gitignored), then copied. Files are unedited FFDec output.

- `java -jar tools/ffdec/ffdec-cli.jar -swf2xml samples/tweendemo/test.swf .work/tween/structure.xml`
- `java -jar tools/ffdec/ffdec-cli.jar -export shape,script,symbolClass .work/tween/out samples/tweendemo/test.swf`

Console output was piped through an ANSI strip (`\x1b[...m`); both commands printed nothing. `structure.xml` contains no escape characters.

Layout as in `test/fixtures/clickgoto/`: `structure.xml`, `symbols.csv` (copied flat from `symbolClass/`), `shapes/{1,2,4,5}.svg`, `scripts/{LeftButton,RightButton,MainTimeline}.as`. `EventWatcher.as` is not copied, as for clickgoto. Shapes, scripts and symbols are byte-identical in size to clickgoto's, as expected since `build.py` only changes the timeline.

## Root checks (all confirmed)

- Line 5: `_xmlExportMajor="4"`, `_xmlExportMinor="2"`, `frameCount="48"`, generator `JPEXS Free Flash Decompiler v.26.4.0`.
- 43 `PlaceObject2Tag` items at `depth="10"` (frames 1 to 43): first at line 1121, last at line 1332.
- `FrameLabelTag` items: `start` (line 1120, frame 1), `middle` (line 1236, frame 24), `gone` (line 1337, frame 44).
- `RemoveObject2Tag depth="10"` at line 1338, directly after the `gone` label, before the `ShowFrameTag` that ends frame 44.

## Line numbers in `structure.xml` for task 5

| Item | Lines | Example |
| --- | --- | --- |
| `matrix` with `hasScale="true"` `hasRotate="true"`, attributes `scaleX scaleY rotateSkew0 rotateSkew1 translateX translateY` | first 1122, last 1333 (one per depth 10 placement) | 1122: `scaleX="0.59999084" scaleY="0.59999084" rotateSkew0="0.0" rotateSkew1="0.0"`; 1127: `rotateSkew0="0.04624939" rotateSkew1="-0.04624939"`; 1333: `scaleX="-1.3999939"` |
| `colorTransform` (`type="CXFORMWITHALPHA"`, attributes `redMultTerm greenMultTerm blueMultTerm alphaMultTerm hasMultTerms hasAddTerms nbits`) | first 1123, last 1334 | 1123: `alphaMultTerm="256"`; 1334: `alphaMultTerm="77"` |
| `FrameLabelTag` attribute `name` | 1120, 1236, 1337 | |
| `RemoveObject2Tag` attribute `depth` | 1338 | |
| Matrix without scale or rotate (flags false, scale and skew attributes omitted) | 82, 148 | `hasRotate="false" hasScale="false"` |

Notes on values:

- Scale and skew are plain decimals (e.g. `0.59999084`), confirming the bug. Translation stays integer twips (frame 1: 1200, 1800 = 60, 90 px).
- Frame 43 (line 1333) is `scaleX=scaleY=-1.3999939`, skew `0.0`, translate 9800, 1800 twips. That is 180 degrees at scale 1.4 expressed as negative scale, translation (490, 90) px.
- The colour transform has only multiplier terms (`hasMultTerms="true"`, `hasAddTerms="false"`), so the add-term attribute names (`redAddTerm` etc.) do NOT occur in the fixture and stay `UNVERIFIED`.
- Element name `colorTransform` occurs, so `colorTransform.element` can be marked verified (line 1123).
- Not present in the fixture: `RemoveObjectTag`, `PlaceObjectTag`, `PlaceObject3Tag`, any `clipDepth` value, filter lists.

## Git checks

See the task report: `git check-ignore` matched none of the fixture paths, and nothing under `tools/` or `.work/` is staged.
