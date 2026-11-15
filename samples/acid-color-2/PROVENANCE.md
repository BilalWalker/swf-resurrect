# Provenance: acid-color-2
| Field         | Value |
|---------------|-------|
| Author        | Mozilla Shumway contributors (test ported to Ruffle by Ruffle contributors) |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/from_shumway/acid/acid-color-2 |
| Licence       | Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `17ef8545fddb565af25d6178e52a7fffaa5c74b4711761952f7c8df5efad8ef9` |

Licence text: samples/LICENSES/Apache-2.0.txt

## Attribution
The file comes from Ruffle's `tests/tests/swfs/from_shumway/` directory at
commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`. Its `README.md` says
that all tests in that directory are ported from Mozilla's Shumway
repository (https://github.com/mozilla/shumway/tree/master/test/swfs) and
are licensed under Apache 2.0 (https://github.com/mozilla/shumway/blob/master/LICENSE)
unless stated otherwise. The reference `test.toml` repeats the origin:
"Test adapted from Shumway at https://github.com/mozilla/shumway/tree/master/test/swfs/acid".
Nothing states otherwise for this test, so Apache-2.0 applies.

No NOTICE file: `mozilla/shumway` ships no NOTICE file (checked in Task 1.1
at commit `16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0`), so there is no NOTICE
text to carry over.

## Embedded fonts
no embedded fonts

The `-swf2xml` dump (FFDec 26.4.0) holds no `DefineFont*` or text tag.

## What the SWF contains
- No ActionScript and no SymbolClass tag. SWF version 21, 24 fps, 1 frame,
  stage 550 x 400 px.
- Four DefineShape tags (ids 1, 2, 4, 6) and three DefineSprite tags,
  placed with seven PlaceObject2 tags on the root timeline.
- No text, sound, filters, masks or tweens.

## Expected behaviour
Visual only. The reference `output.txt` is empty (0 bytes) and there is no
`input.json`, so there is no trace to compare. The run is scored on the
rendered frame only.

## Reference behaviour (`reference/`)
Copied unedited from the same Ruffle test directory at the same commit,
same licence (Apache-2.0):
- `reference/output.txt`: empty (0 bytes).
- `reference/test.toml`: `num_frames = 1`, tiered image tolerances, high
  quality renderer.
- `input.json`: does not exist upstream. Upstream also holds
  `output.expected.png` and `test.fla`; neither is copied.