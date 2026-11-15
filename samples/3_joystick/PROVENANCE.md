# Provenance: 3_joystick
| Field         | Value |
|---------------|-------|
| Author        | Mozilla Shumway contributors (test ported to Ruffle by Ruffle contributors) |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/from_shumway/3_joystick |
| Licence       | Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `9f21a582398c3d059cbb89e8e060db2886af286383de296be8bafe241d531370` |
Licence text: samples/LICENSES/Apache-2.0.txt
## Attribution
The file comes from Ruffle's `tests/tests/swfs/from_shumway/` directory at
commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`. Its `README.md` says
that all tests in that directory are ported from Mozilla's Shumway
repository (https://github.com/mozilla/shumway/tree/master/test/swfs) and
are licensed under Apache 2.0 (https://github.com/mozilla/shumway/blob/master/LICENSE)
unless stated otherwise. Nothing states otherwise for this test (its
`test.toml` carries no licence note and the directory has no NOTICE or
licence file of its own), so Apache-2.0 applies. The class source comment
names http://www.adobe.com/devnet/actionscript/samples/interactivity_3.html
as the origin of the demo.
No NOTICE file: `mozilla/shumway` ships no NOTICE file (checked in Task 1.1
at commit `16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0`), so there is no NOTICE
text to carry over.
## Embedded fonts
no embedded fonts
The `-swf2xml` dump (FFDec 26.4.0) holds no `DefineFont*` or text tag.
## What the SWF contains
- SWF version 9, 60 fps, 1 frame. One SymbolClass entry,
  `0;"code.Interactivity3"` (the root class, package `code`).
- Eight DefineShape tags (one `DefineShape`, one `DefineShape2`, six
  `DefineShape3`) and seven DefineSprite tags.
- No text, sound or embedded bitmaps.
## Expected behaviour
Interactive: a joystick ball dragged with the mouse. `input.json` (595
bytes) holds `MouseMove`, `MouseDown` and `MouseUp` entries without a `btn`
field, and `reference/test.toml` sets `num_ticks = 21`. The reference
`output.txt` holds four trace lines (`Interactivity3 init`,
`dragPressHandler`, `wrap`, `dragReleaseHandler`).
## Reference behaviour (`reference/`)
Copied unedited from the same Ruffle test directory at the same commit,
same licence (Apache-2.0):
- `reference/output.txt`: the four trace lines above.
- `reference/test.toml`: `num_ticks = 21`, tiered image tolerances (128 with
  0 outliers, 32 with 2500 outliers), optional high quality renderer.
- `input.json`: copied unedited to `samples/3_joystick/input.json`.
Upstream also holds `output.expected.png` and `3_joystick.fla`; neither is
copied.