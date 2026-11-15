# Provenance: radial
| Field         | Value |
|---------------|-------|
| Author        | Ruffle contributors |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/visual/simple_shapes/gradients/radial |
| Licence       | MIT OR Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `b7199186aca5165205b23570294efa97b0fdfab4d62ea2c00527c2c4da0841c1` |

Ruffle is dual-licensed under MIT and Apache-2.0 (see `LICENSE.md` in the
Ruffle repository). This file is one of Ruffle's own visual regression
tests, taken at commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`.

## Licence chosen
Licence chosen: MIT, from the option `MIT OR Apache-2.0`. The licence text
is in `samples/LICENSES/MIT-Ruffle.txt`.

## Embedded fonts
no embedded fonts

The `-swf2xml` dump (FFDec 26.4.0) holds no `DefineFont*` or text tag.

## What the SWF contains
- No ActionScript and no SymbolClass tag. SWF version 37, 24 fps, 1 frame.
- One DefineShape4 (id 1) with a radial gradient fill, placed once on the
  root timeline. A focal point, if any, is recorded as `gradient-focal`.
- No text, sound, filters, masks or tweens.

## Expected behaviour
Visual only. The reference `output.txt` is empty (0 bytes) and there is no
`input.json`, so there is no trace to compare. The run is scored on the
rendered frame only.

## Reference behaviour (`reference/`)
Copied unedited from the same Ruffle test directory at the same commit,
same licence (MIT OR Apache-2.0):
- `reference/output.txt`: empty (0 bytes).
- `reference/test.toml`: `num_frames = 1`, image tolerance 1, optional
  renderer at `low` quality.
- `input.json`: does not exist upstream.
