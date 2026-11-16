# Provenance: static_text
| Field             | Value |
|-------------------|-------|
| Author            | Ruffle contributors |
| Source URL        | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/avm2/static_text |
| Licence           | MIT OR Apache-2.0 (MIT chosen) |
| Modifications     | None. The fetched `test.swf` is byte-identical to the upstream file. |
| SHA-256           | `b16194d9913a94b90a733841e8f19cd72fae38e223bc92e5e1040c368f33997e` |
| Not in the Repository | yes. `test.swf` embeds 17 glyph outlines of "Times New Roman" under a Monotype copyright, and no licence permitting redistribution is established. |
| Fetch command     | `npm run fetch:static-text` |
| Target path       | `.work/samples/static_text/test.swf` |
| Embedded fonts    | `DefineFont3Tag` font id 1, "Times New Roman", 17 glyphs (see Embedded fonts below) |

Licence text: samples/LICENSES/MIT-Ruffle.txt

The licence above covers the test file as authored by Ruffle contributors
(Ruffle is dual-licensed under MIT and Apache-2.0). The licence of the
embedded font is not part of it.

## Attribution
The test comes from Ruffle's `tests/tests/swfs/avm2/` directory at commit
`4a8d39661ed8aec97afee1504a4e33080da2efd0`. The Repository holds only this
note and `reference/output.txt` and `reference/test.toml`, which contain no
font data. The SWF is downloaded on request by `npm run fetch:static-text`,
which writes it only when its SHA-256 equals the value above.

## Embedded fonts
- `DefineFont3Tag`, font id 1, font name "Times New Roman", 17 glyphs.
- `DefineFontNameTag` for font id 1, copyright text (from the FFDec 26.4.0
  `-swf2xml` dump): "© 2017 The Monotype Corporation. All Rights Reserved.
  Hebrew OpenType Layout logic copyright © 2003 & 2007, Ralph Hancock & John
  Hudson. This layout logic for Biblical Hebrew is open source software under
  the MIT License; see embedded license description for details."

## What the SWF contains
- 3,923 bytes, one frame on the root timeline.
- One SymbolClass entry: `0;"test_fla.MainTimeline"` (the root).
- One `DefineText` tag (static text) using the font above.

## Reference behaviour (`reference/`)
Copied unedited from the same Ruffle test directory at the same commit:
- `reference/output.txt`: three lines (`Caught error: ArgumentError: Error
  #2012: StaticText$ class cannot be instantiated.`, `e.errorID: 2012`,
  `Child: [object StaticText]`).
- `reference/test.toml`: `num_frames = 1`.
Upstream has no `input.json` for this test.

## Known limits as a sample
Trace comparison against `reference/output.txt`, measured in task 29.2
(Overall_Match 100, Trace_Score 0, 3 missing lines, 1 extra line).
Named_Limit `static-text-class-name` (trace, not visual; there is no entry in
a `residual-causes.json`, which covers visual regions only):
- Reference line 3 is `Child: [object StaticText]`. Flash prints exactly that.
- We print `Child: [object Shape]`.
- Cause: static text is drawn as a shape symbol, the Shim has no `StaticText`
  class, and `getChildAt(0)` returns the `ShapeObject`, whose class name is
  `Shape`.
- The comparison counts the reference line `Child: [object StaticText]` as one
  of the 3 missing lines and our `Child: [object Shape]` as the 1 extra line.
  `test/e2e/staticText.e2e.test.ts` pins both lists.
Open items, not fixed here:
- The `try`/`catch` in `Test` is still left untranslated as comments ("try is
  not supported"), so reference lines 1 and 2 (`Caught error: ArgumentError:
  Error #2012: ...` and `e.errorID: 2012`) never print.
- Trace_Score is still 0, with the same 3 missing reference lines.
## Generated, not committed
The FFDec structure dump and the symbol list are generated from the fetched
SWF under `.work/samples/static_text/` and are not committed, because a dump
may hold the glyph shapes. There is no `test/fixtures/static_text/`.