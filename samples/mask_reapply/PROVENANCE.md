# Provenance: mask_reapply
| Field         | Value |
|---------------|-------|
| Author        | Ruffle contributors |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/avm2/mask_reapply |
| Licence       | MIT OR Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `8146cb4de7e39bdb2d4ee418e90d65509d4b3afa246b899ac3260abfa6ac41c7` |

Ruffle is dual-licensed under MIT and Apache-2.0 (see `LICENSE.md` in the
Ruffle repository). This file is one of Ruffle's own AVM2 regression tests,
taken at commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`. The upstream
directory holds no NOTICE file.

## Licence chosen
Licence chosen: MIT, from the option `MIT OR Apache-2.0`. The licence text
is in `samples/LICENSES/MIT-Ruffle.txt`.

## Embedded fonts
no embedded fonts

The `-swf2xml` dump (FFDec 26.4.0) holds no `DefineFont*` or text tag.

## What the SWF contains
- ActionScript 3, SWF version 15, stage 150 x 150 px, 24 fps, white
  background, 1 frame.
- Root class `Main` (SymbolClass id 0) extends `Sprite` and declares the
  public fields `mask1`, `maskee1`, `mask2`, `maskee2`. Two shapes (ids 1
  and 3) are wrapped in sprites 2 and 4, placed on the root as the named
  instances `mask1`, `maskee1`, `mask2` and `maskee2`. `mask1` and `mask2`
  carry a clip depth, so the timeline itself applies two masks.
- The constructor assigns `maskee1.mask = mask1` and `mask2.mask = maskee2`
  and traces `Masks reapplied`.
- No text, sound, filters or tweens.

## Expected behaviour
Visual plus one trace line, `Masks reapplied`, on the first tick.

## Class source
Upstream ships no ActionScript source for this test. The class source in
`test/fixtures/mask_reapply/scripts/Main.as` is the FFDec 26.4.0 `-export
script` output of `test.swf`.

## Reference behaviour (`reference/`)
Copied unedited from the same Ruffle test directory at the same commit,
same licence (MIT OR Apache-2.0):
- `reference/output.txt`: `Masks reapplied` (16 bytes).
- `reference/test.toml`: `num_ticks = 1`, image tolerance 1, required
  renderer at `high` quality.
- `input.json`: does not exist upstream.
- `output.expected.png` (upstream reference image, 471 bytes) is not
  copied, as for the other samples.