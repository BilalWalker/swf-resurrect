# 3_joystick FFDec findings
Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`), Java 17.0.12, from `samples/3_joystick/test.swf`:
- `-swf2xml` to `structure.xml` (copied whole).
- `-export script,symbolClass` gave `symbols.csv` (`0;"code.Interactivity3"`). The class source `code/Interactivity3.as` is the upstream file from Ruffle's `3_joystick/code/` directory, copied unedited.
- No font or text tag; no embedded outlines.