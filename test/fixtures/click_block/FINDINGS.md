# click_block FFDec findings

Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`) from `samples/click_block/test.swf`:

- `-swf2xml` to `structure.xml` (copied whole).
- `-export script,symbolClass`: `scripts/test_fla/MainTimeline.as` (the class source; upstream has none) and `symbols.csv` (`0;"test_fla.MainTimeline"`).
- One font tag, `DefineFont3Tag` id 9 `_sans` with 0 glyphs; no embedded outlines.
