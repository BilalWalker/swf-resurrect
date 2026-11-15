# radial FFDec findings
Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`), Java 17.0.12, from `samples/radial/test.swf`:
- `-swf2xml` to `structure.xml` (copied whole).
- `-export shape,script,symbolClass` gave `shapes/1.svg` only. `scripts/` is empty and there is no `symbolClass/symbols.csv`: the SWF has no SymbolClass tag, so none is copied.
