# Provenance: click_block
| Field         | Value |
|---------------|-------|
| Author        | Ruffle contributors |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/avm2/click_block |
| Licence       | MIT OR Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `4023640bdd902ef185c51ea469956fe5166f4983aaf63a365d28c55292e1ee82` |

Ruffle is dual-licensed under MIT and Apache-2.0 (see `LICENSE.md` in the
Ruffle repository). This file is one of Ruffle's own AVM2 regression tests,
taken at commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`. The upstream
directory holds no NOTICE file (its files are `input.json`, `output.txt`,
`test.fla`, `test.swf` and `test.toml`).

## Licence chosen

Licence chosen: MIT, from the option `MIT OR Apache-2.0`. The licence text
is in `samples/LICENSES/MIT-Ruffle.txt`.

## Embedded fonts

The `-swf2xml` dump (FFDec 26.4.0) holds one font tag:

- `DefineFont3Tag`, font id 9, name `_sans`, 0 glyphs (empty
  `glyphShapeTable`). It is used by the `DefineEditTextTag` with character
  id 10.

A font reference with zero glyphs counts as no embedded outlines: the SWF
embeds no font outlines and nothing needs a font licence.

## What the SWF contains

- ActionScript 3, SWF version 15, stage 550 x 400 px, 24 fps, white
  background, 10 frames.
- Root class `test_fla.MainTimeline` (SymbolClass id 0) extends `MovieClip`
  and declares `click_mc`. Its frame 1 script adds a `MouseEvent.CLICK`
  listener on `click_mc.stage`; the handler traces the pointer position
  (`mouseX`, `mouseY`) and the target and its name.
- One `DefineBitsLossless2` bitmap used as two bitmap fills, one morph
  shape, one edit text (`Text`), sprites with the named instance
  `click_mc`.
- No sound, filters or tweens.

## Expected behaviour

Visual, plus one trace line per mouse click from the input script
(`reference/input.json`, five `MouseMove`/`MouseDown`/`MouseUp` triples).
`test.toml` sets `num_frames = 100`.

## Class source

Upstream ships no ActionScript source for this test (only the `.fla`). The
class source in `test/fixtures/click_block/scripts/test_fla/MainTimeline.as`
is the FFDec 26.4.0 `-export script` output of `test.swf`.

## Reference behaviour (`reference/`)

Copied unedited from the same Ruffle test directory at the same commit,
same licence (MIT OR Apache-2.0):

- `reference/output.txt`: five `Clicked at ...` lines (277 bytes).
- `reference/input.json`: the mouse input script (1,011 bytes).
- `reference/test.toml`: `num_frames = 100` (17 bytes).
- `output.expected.png` does not exist upstream for this test.