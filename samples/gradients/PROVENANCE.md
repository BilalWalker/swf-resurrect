# Provenance: gradients
| Field         | Value |
|---------------|-------|
| Author        | Ruffle contributors |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/visual/simple_shapes/gradients/gradients |
| Licence       | MIT OR Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `74a3c6496d1e1ae0774be766d0ddba23ec1c946b5821c768a587c3e9678c497e` |

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
- One DefineShape4 (id 1) with two linear gradient fills, one of them with
  `spreadMethod="reflect"`, placed once on the root timeline.
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
