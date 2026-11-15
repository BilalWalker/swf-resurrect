# Provenance: slider_component
| Field         | Value |
|---------------|-------|
| Author        | Mozilla Shumway contributors (test ported to Ruffle by Ruffle contributors) |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/from_shumway/slider_component |
| Licence       | Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `bf6dbcb755b764beeb0c8d68af24438d803b2e39e7d171fc663551d364593e9b` |
Licence text: samples/LICENSES/Apache-2.0.txt
## Attribution
The file comes from Ruffle's `tests/tests/swfs/from_shumway/` directory at
commit `4a8d39661ed8aec97afee1504a4e33080da2efd0`. Its `README.md` says
that all tests in that directory are ported from Mozilla's Shumway
repository (https://github.com/mozilla/shumway/tree/master/test/swfs) and
are licensed under Apache 2.0 (https://github.com/mozilla/shumway/blob/master/LICENSE)
unless stated otherwise. Nothing states otherwise for this test (its
`test.toml` carries no licence note and the directory holds only
`input.json`, `output.txt`, `test.fla`, `test.swf` and `test.toml`, with no
NOTICE or licence file of its own), so Apache-2.0 applies.
No NOTICE file: `mozilla/shumway` ships no NOTICE file (checked in Task 1.1
at commit `16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0`), so there is no NOTICE
text to carry over.
## Embedded fonts
no embedded fonts
The `-swf2xml` dump (FFDec 26.4.0) holds no `DefineFont*`, `DefineText*` or
`DefineEditText` tag. The words `TextField` and `textField` in the dump are
names in the ActionScript constant pool, not font or text tags.
## What the SWF contains
- 18,996 bytes, 550 x 400 px, 24 fps, 1 frame on the root timeline.
  Twelve SymbolClass entries, from `0;"slider1_fla.MainTimeline"` (the
  root) to `21;"fl.controls.Button"` and `20;"fl.controls.Slider"`
  (the `fl.*` Adobe component classes) and `3;"fl.core.ComponentShim"`.
- Six `DefineShape` and three `DefineShape3` tags, twelve `DefineSprite`
  tags and three `DefineScalingGrid` tags.
- No text, sound or embedded bitmaps.
## Expected behaviour
Interactive: a Flash Slider component. `reference/input.json` (666 bytes)
holds `MouseMove`, `MouseDown` and `MouseUp` entries (with a `btn` field)
and a press at (250, 22) released at (150, 22); `reference/test.toml` sets
`num_ticks = 10`. The reference `output.txt` holds four lines
(`addEventListener` and three `changeHandler` lines, values 180, 230, 130).
## Reference behaviour (`reference/`)
Copied unedited from the same Ruffle test directory at the same commit,
same licence (Apache-2.0):
- `reference/output.txt`: the four lines above (74 bytes).
- `reference/test.toml`: `num_ticks = 10`.
- `reference/input.json`: copied unedited to `samples/slider_component/reference/input.json`.
Upstream also holds `test.fla`; it is not copied.
## Fixtures
`test/fixtures/slider_component/` holds the FFDec 26.4.0 `-swf2xml` dump
(`structure.xml`), the symbol list (`symbols.csv`) and the 27 class sources.
Upstream has no ActionScript sources for this test, so the class sources
are the FFDec `-export script` output, kept in their package directory
layout (`fl/controls/`, `fl/core/`, `fl/events/`, `fl/managers/`,
`slider1_fla/` and the skin classes at the root).