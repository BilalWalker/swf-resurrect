# acid-color-2 FFDec findings
Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`), Java 17.0.12, from `samples/acid-color-2/test.swf`:
- `-swf2xml` to `structure.xml` (copied whole).
- `-export shape,script,symbolClass` gave `shapes/1.svg`, `2.svg`, `4.svg`, `6.svg` (all copied). `scripts/` is empty and there is no `symbolClass/symbols.csv`: the SWF has no SymbolClass tag, so none is copied.