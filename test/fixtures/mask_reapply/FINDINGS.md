# mask_reapply FFDec findings
Captured with FFDec 26.4.0 (`tools/ffdec/ffdec-cli.jar`), Java 17.0.12, from `samples/mask_reapply/test.swf`:
- `-swf2xml` to `structure.xml` (copied whole).
- `-export script,symbolClass`: `scripts/Main.as` (the class source; upstream has none) and `symbols.csv` (`0;"Main"`).
- The root class `Main` assigns `maskee1.mask = mask1`, which the Shim does not support (TS2339, Requirement 12.7). `Main` is therefore a Loose_Class and is emitted as `src/Main.class.ts`.