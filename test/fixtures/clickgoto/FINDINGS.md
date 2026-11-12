# Click_Sample FFDec findings

Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`), Java 17.0.12, from `samples/clickgoto/test.swf`.

## Task 2.1: capture

Two invocations, run into `.work/ffdec-capture/` (gitignored):

- `java -jar tools/ffdec/ffdec-cli.jar -swf2xml samples/clickgoto/test.swf .work/ffdec-capture/structure.xml`
- `java -jar tools/ffdec/ffdec-cli.jar -export shape,script,symbolClass .work/ffdec-capture samples/clickgoto/test.swf`

Both printed nothing on the console, so there was no ANSI output to strip.

Layout of the export: `shapes/<id>.svg`, `scripts/<Class>.as`, `symbolClass/symbols.csv`.
Note that `symbols.csv` sits in the `symbolClass/` subfolder in the export. It is copied flat into the fixture directory.

Fixture sizes (bytes):

| File | Size |
| --- | --- |
| structure.xml (whole file, under 100 KB) | 62443 |
| symbols.csv | 51 |
| shapes/1.svg | 619 |
| shapes/2.svg | 619 |
| shapes/4.svg | 619 |
| shapes/5.svg | 619 |
| scripts/LeftButton.as | 908 |
| scripts/RightButton.as | 913 |
| scripts/MainTimeline.as | 2686 |

Not copied: `scripts/EventWatcher.as` (1660 bytes, not required), `tools/`, `samples/clickgoto/original-source/`.

## Task 2.2: "to verify" items answered against `structure.xml`

Line numbers refer to `test/fixtures/clickgoto/structure.xml`. Names are recorded in `src/convert/ffdecXml.ts` (`FFDEC_XML`, `SUPPORTED_XML_MAJOR = 4`). CONFIRMED = seen in the sample. UNVERIFIED = absent from the sample; the name is FFDec's documented class/field name and must be re-checked on a real SWF that uses it.

| Item | Answer | Status | Fixture line |
| --- | --- | --- | --- |
| Root element | `<swf>`; `_xmlExportMajor="4"`, `_xmlExportMinor="2"` | CONFIRMED | 5 |
| How a tag item states its kind | `<item type="XxxTag" ...>`: the `type` attribute | CONFIRMED | 8, 9, 81 |
| Root Frame_Rate | root attribute `frameRate="24.0"`, plain decimal, not fixed-point | CONFIRMED | 5 |
| Root frame count | root attribute `frameCount="3"` | CONFIRMED | 5 |
| Stage rectangle | CHILD element `<displayRect Xmin Xmax Ymin Ymax>` of the root, integer twips (0, 11000, 0, 8000 = 550 x 400 px) | CONFIRMED | 6 |
| AS3 FileAttributes flag | `<item type="FileAttributesTag" actionScript3="true">` | CONFIRMED | 8 |
| `SetBackgroundColorTag` | child `<backgroundColor type="RGB" red green blue>`, 0..255 | CONFIRMED | 9-10 |
| Shape definition tag | `DefineShape4Tag` with id attribute `shapeId`; bounds in child `shapeBounds` (twips) | CONFIRMED for `DefineShape4Tag`; `DefineShapeTag`/`DefineShape2Tag`/`DefineShape3Tag` UNVERIFIED | 23, 25 |
| Sprite definition | `DefineSpriteTag`, id attribute `spriteId`, declared frame count attribute `frameCount`, children in `<subTags>` | CONFIRMED | 79-80 |
| Frame end | `ShowFrameTag`, in sprites and at root | CONFIRMED | 84, 1120-1122 |
| Placement tag | `PlaceObject2Tag` with `characterId`, `depth`, `name`, flags `placeFlagMove`, `placeFlagHasCharacter`, `placeFlagHasMatrix`, `placeFlagHasColorTransform`, `placeFlagHasName`, `placeFlagHasClipDepth`, `placeFlagHasRatio` | CONFIRMED | 81, 155 |
| Optional placement fields | `characterId` and `name` are present only when their flag is true (absent on line 85 for `name`); `matrix` child absent when `placeFlagHasMatrix="false"` (line 85) | CONFIRMED | 85, 155-156 |
| Move + characterId | Sprite 3 frame 2 and sprite 6 frame 2: `placeFlagMove="true"` with `characterId` set and no matrix. This is the "replace character, keep matrix" case in the design's resolution rules | CONFIRMED | 85, 151 |
| Matrix | child `<matrix type="MATRIX" translateX translateY hasScale hasRotate ...>`; translate fields are integer twips (2870 = 143.5 px, 5400 = 270 px, 8300 = 415 px, 5450 = 272.5 px, matches PROVENANCE) | CONFIRMED | 82, 156, 159 |
| Matrix scale/rotate | When `hasScale="false"` / `hasRotate="false"` the scale and rotate attributes are OMITTED (not zero), so absent means identity scale (1, 1) and zero skew. Field names `scaleX scaleY rotateSkew0 rotateSkew1` and the 16.16 fixed-point scaling are UNVERIFIED (flags are false everywhere) | flags CONFIRMED, values UNVERIFIED | 82 |
| Colour transform | `placeFlagHasColorTransform` is false everywhere. Child element name `colorTransform`, fields `redMultTerm`... `alphaAddTerm`, and 1/256 scaling are UNVERIFIED | UNVERIFIED (flag name CONFIRMED) | 81 |
| `PlaceObject` / `PlaceObject3Tag` | Not in sample. Filter list fields `placeFlagHasFilterList` / `surfaceFilterList` UNVERIFIED | UNVERIFIED | none |
| `RemoveObject` / `RemoveObject2Tag` | Not in sample. Assumed `depth` (and `characterId` for `RemoveObjectTag`) | UNVERIFIED | none |
| Clip depth | Flag `placeFlagHasClipDepth` confirmed (false); value attribute `clipDepth` UNVERIFIED | flag CONFIRMED, value UNVERIFIED | 81 |
| Frame labels | `FrameLabelTag` not in sample (its name attribute is UNVERIFIED). A `DefineSceneAndFrameLabelDataTag` exists with empty `<frameNums/>` and `<frameNames/>` | UNVERIFIED | 13-22 |
| Morph shape tags | `DefineMorphShapeTag`, `DefineMorphShape2Tag` not in sample | UNVERIFIED | none |
| Unsupported kinds | text (`DefineTextTag`, `DefineText2Tag`, `DefineEditTextTag`), sound (`DefineSoundTag`, `SoundStreamHeadTag`, `SoundStreamHead2Tag`), button (`DefineButtonTag`, `DefineButton2Tag`), video (`DefineVideoStreamTag`): none in sample | UNVERIFIED | none |
| SymbolClassTag cross-check | `<tags><item>id</item>...</tags>` and `<names><item>Class</item>...</names>`, parallel lists; ids 6, 3, 0 | CONFIRMED | 1108-1119 |
| Empty sprites | Sample has no empty sprite; how FFDec dumps one remains UNVERIFIED | UNVERIFIED | none |

### Findings that differ from, or add detail to, the design

1. **Root timeline order.** The root's placements (lines 155-159), `DoABC2Tag` (161), `SymbolClassTag` (1108) and the three `ShowFrameTag`s (1120-1122) are all direct children of `<tags>`. All placements land in root frame 1; frames 2 and 3 are empty `ShowFrameTag`s only. The resolver must treat `DoABC2Tag`/`SymbolClassTag` as non-timeline tags and the placements persist into frames 2 and 3.
2. **Sprite id attribute.** Design text says `shapeId`/`characterId`. Reality: shapes use `shapeId`, sprites use `spriteId`; only placements use `characterId`.
3. **Stage rectangle** is a child element `displayRect`, not an attribute of the root. The design allowed either.
4. **Omitted attributes.** Scale and rotate attributes are omitted, not zero, when `hasScale`/`hasRotate` are false. A matrix with no scale means scale 1, not 0. The adapter must default `a=d=1`, `b=c=0`.
5. **SVG origin wrapper format.** `shapes/1.svg` line 3 is `<g transform="matrix(1.0, 0.0, 0.0, 1.0, 42.5, 40.5)">` (decimals, comma plus space separators). The design describes it as `matrix(1,0,0,1,tx,ty)`. `extractSvgOrigin` must accept optional whitespace after commas and `1.0` style numbers. The fixture value for shape 1 is origin (42.5, 40.5), consistent with its 85 x 81 px size.
6. **`symbols.csv`** is exported under `symbolClass/`, as noted in 2.1; the Unpacker's `symbolClassPath` already assumes this.
7. **Extra tags in the dump** that the reader should ignore without raising `other-tag`: `EnableDebugger2Tag`, `DoABC2Tag`, `SymbolClassTag`, `DefineSceneAndFrameLabelDataTag`, `FileAttributesTag`, `SetBackgroundColorTag`. `EnableDebugger2Tag` carries a `passwordHash` attribute; it is never copied to output.

No finding contradicts a requirement. Nothing in the design needed to be edited; items 2, 4 and 5 are adapter details for later tasks.

## Task 2.3: SVG origin sign, empty sprite, zero shapes, morph shapes, determinism

Scratch work is in `.work/t23*` (gitignored). All results are from FFDec 26.4.0 on `samples/clickgoto/test.swf` unless stated.

### SVG origin sign convention (CONFIRMED)

Every captured SVG has one wrapper `<g transform="matrix(1.0, 0.0, 0.0, 1.0, tx, ty)">` (line 3), and `tx, ty` equal minus the shape's own top-left bound. The shape bounds in `structure.xml` (`shapeBounds`, twips) are centred on the shape origin, so `tx = -Xmin / 20` and `ty = -Ymin / 20`.

| Shape | Used by | SVG size (px) | `tx, ty` | `shapeBounds` Xmin..Xmax, Ymin..Ymax (twips) | Fixture line |
| --- | --- | --- | --- | --- | --- |
| 1 | `r_button` frame 1 | 85 x 81 | 42.5, 40.5 | -850..850, -810..810 | 25 |
| 2 | `r_button` frame 2 | 85 x 81 | 42.5, 40.5 | -850..850, -810..810 | 53 |
| 4 | `l_button` frame 1 | 78 x 76 | 39.0, 38.0 | -780..780, -760..760 | 91 |
| 5 | `l_button` frame 2 | 78 x 76 | 39.0, 38.0 | -780..780, -760..760 | 119 |

The path data inside the group is relative to the shape origin (shape 1: `M-42.0 -40.0 ... 42.0 40.0`, strokes widen the box by 0.5 px per side, hence 85 x 81 and not 84 x 80).

Result: **drawing the SVG at `(-tx, -ty)` inside the shape node is correct.** The group translate moves the shape origin to SVG pixel `(tx, ty)`; shifting the whole SVG by `(-tx, -ty)` puts the shape origin back at the node origin. The sign is NOT the other way round. Check against the placements in `PROVENANCE.md`:

- `l_button` placed at (143.5, 270), shape 4/5 with `tx, ty` = (39, 38): the SVG is drawn at (143.5 - 39, 270 - 38) = (104.5, 232) in stage space, covering x 104.5..182.5, y 232..308. Shape origin lands on (143.5, 270).
- `r_button` placed at (415, 272.5), shape 1/2 with `tx, ty` = (42.5, 40.5): the SVG is drawn at (372.5, 232), covering x 372.5..457.5, y 232..313. Shape origin lands on (415, 272.5).
- Both rectangles lie fully inside the 550 x 400 stage and do not overlap (182.5 < 372.5). With the opposite sign the SVGs would be drawn at (182.5, 308) and (457.5, 313), which still fit on stage, so the stage bounds alone do not tell the signs apart. The decisive check is that the shape origin (the centre of the rectangle) lands exactly on the `PROVENANCE.md` placement point only with `(-tx, -ty)`; the other sign puts it 2 x (tx, ty) away.

`extractSvgOrigin` should return `{ x: tx, y: ty }` as written in the group, and the Pixi adapter should position the graphics at `(-origin.x, -origin.y)`. No conflict with the design.

**Correction (2026-11-11):** the check above was arithmetic only, against the `PROVENANCE.md` placements, and was never run against Pixi. Pixi 8.22 `Graphics.svg` ignores the group transform, so drawing at `(-tx, -ty)` moved every shape one origin up-left. The paths are already in shape-origin coordinates; Convert now strips the wrapper and the runtime does not shift. See verify task 17 (`.kiro/specs/verify/tasks.md`, commit b8908f9).

### Zero-`ShowFrameTag` sprite (partly verifiable)

The sample has no empty sprite, so I used a hand-edited XML (`.work/t23b/emptysprite.xml`, sprite 3 with both `ShowFrameTag` items removed), `-xml2swf`, then `-swf2xml` again.

- The re-dump keeps the sprite as `<item type="DefineSpriteTag" frameCount="2" hasEndTag="true" spriteId="3">` with its `PlaceObject2Tag` children and **zero** `ShowFrameTag` items. `frameCount` stays at the stored attribute value (2), it is not recomputed from the tags.
- A sprite whose `subTags` were emptied entirely is dumped as `<subTags />` (an empty element, not a missing one), still with `frameCount="2"`.
- Caveat: this proves what the dump looks like for a hand-edited tag list, not what a real authoring tool writes for an empty clip. Flash/Animate normally stores `frameCount="1"` plus one `ShowFrameTag` for an empty movie clip. A natively compiled empty sprite is **not verifiable on this sample**.

Consequences for the design: do not trust the `frameCount` attribute over the tag list. Count `ShowFrameTag` items for the real frame count, and keep the design's fallback for a sprite that ends up with zero frames (treat it as one empty frame). The adapter must also tolerate a missing or empty `subTags` element, and must not crash on a `subTags` that contains placements but no `ShowFrameTag` (their ops belong to no frame).

### Zero-shape SWF and the `shapes/` folder (VERIFIED on an edited copy)

Test input: `.work/t23b/noshapes.swf`, built with `-xml2swf` from the fixture dump with every `DefineShape4Tag` removed (the placements still reference the missing ids, which FFDec ignores for export).

- `-export shape,script,symbolClass <dir> noshapes.swf`: exit code 0, and an **empty `shapes/` directory is created** next to `scripts/` and `symbolClass/`.
- `-export shape <dir> noshapes.swf` alone: exit code 0 and the output directory exists but is empty.
- So `readUnpacked` can rely on `shapes/` being present for the combined invocation; a missing `shapes/` should still be treated as `MissingExportError` only when the dump declares shapes (as Task 5.4 already says), but the Unpacker's "four exports exist" check is safe for a SWF with no shapes.

### Export layout depends on the number of types (new detail)

With the combined invocation `-export shape,script,symbolClass` the files land in `shapes/<id>.svg`, `scripts/<Class>.as`, `symbolClass/symbols.csv`. With `-export shape` alone the SVGs are written **flat** into the output directory (`<dir>/1.svg`, not `<dir>/shapes/1.svg`). The pipeline always uses the combined invocation, so the layout in 2.1 holds; do not use single-type exports in tests or helpers.

### Morph shapes (documentation only)

`java -jar ffdec-cli.jar -help export` lists `shape` and `morphshape` as separate export types (`morphshape:svg`, ...). So `-export shape` does **not** write morph shapes; they would need `morphshape`. The sample has no morph shape, so this is **not verifiable on this sample**. Consequence: morph shapes never appear in `shapes/`, which agrees with the design (morph shapes are skipped with an unsupported entry). `morphShapeIds` must therefore come from the structure dump alone.

### Determinism (CONFIRMED)

Two separate runs of `-export shape,script,symbolClass` into different directories gave byte-identical output for all 9 files (4 SVGs, 4 scripts, `symbols.csv`), compared with `Get-FileHash` (SHA-256), 0 differences. Two runs of `-swf2xml` also gave identical hashes. The SVGs contain no timestamps or random ids. The console banner carries a time (`Total export time`), but it is not part of any output file.

### Conflicts with the design

None found. Added details: use the `ShowFrameTag` count rather than the `frameCount` attribute; single-type `-export` is flat; morph shapes need a separate export type and are absent from `shapes/`.
