# Tech Stack

Status: unpack, convert, translate and emit are built; verify, UI and hosting are not. Update this file as tooling is added, and verify commands against `package.json` before relying on them.

## Stack
- Language: TypeScript (strict) for the pipeline, runtime, and emitted projects. The repo's `typescript` is 7.0.2 (`tsc`).
- In-process type-check: `typescript-js` is an alias for `typescript@6.0.3`. TS 7 has no in-process `createProgram`; 6.0.3 is the last JS release that does. Only `src/translate/tsSyntaxCheck.ts` and `src/translate/typeCheckGate.ts` import it.
- Emitted projects: Vite + TypeScript + PixiJS.
- Unpack: FFDec (JPEXS) CLI, run as a separate process. Do not write a SWF parser.
- Verify: Ruffle renders the original; headless Chromium renders the output. Compare with SSIM or pixelmatch with anti-aliasing tolerance.
- LLM: used only in the repair loop (type-check errors, renaming `_loc1_`-style placeholders, short comments), with a bounded retry count.
- Tests: property-based (e.g. fast-check) plus unit tests.

## Pipeline
`unpack (FFDec) -> convert (SVG/PNG/audio/timeline JSON) -> translate (AS3 -> TS) -> emit (Vite+Pixi project)`, then the in-process type-check gate on the emitted files. `verify (Ruffle vs output)` is planned.

Outputs next to the project: `unsupported-features.json` and `translation-report.json`. Type errors are reported, not fatal.

## Conventions
- Transpiler is deterministic: same input gives same output. Syntax rewrite in code first (`package`/`import` to ES modules, `int`/`uint`/`Number` to `number`, `Vector.<T>` to `T[]`, `for each` to `for...of`, `is`/`as`), LLM second.
- The type-check gate runs on translated code (no `npm install`, no child process). Planned: feed errors back to the LLM for a bounded number of retries; flag leftovers in the report.
- Shim additions are listed with the fixture line that needs each in `template/shim/ADDED_APIS.md`.
- Shapes via FFDec SVG export; bitmaps PNG; sounds MP3/OGG; timeline as per-frame display list JSON (depth, symbol id, matrix, colour transform, instance name, labels). Tweens are already baked into placements.
- Compare only deterministic content (timeline frames, scripted-input states). Free-running random play is reported as "not compared".
- Exact pixel equality is not a goal.

## Common commands
Repo root (`package.json`):
```
npm install
npm run typecheck           # tsc --noEmit
npm run typecheck:template  # tsc --noEmit -p tsconfig.template.json
npm test -- --run           # single run, no watch mode
npm run pipeline -- <in.swf> <outdir> [--force]   # tsx src/pipeline/cli.ts
```
Inside an emitted project (`out/<sample>`): `npm install`, `npm run dev` (run manually, do not block on it), `npm run build`, `npm run typecheck`.

## FFDec (checked by hand, 2026-11-11)
- Version 26.4.0, zip release from github.com/jindrapetrik/jpexs-decompiler, unpacked to `tools/ffdec/` (gitignored, never committed). Needs Java 17+.
- Run as `java -jar tools/ffdec/ffdec-cli.jar <args>`. Output contains ANSI colour codes; strip them before parsing.
- `-export shape,script,symbolClass <outdir> <swf>` writes `shapes/<id>.svg`, `scripts/<Class>.as`, `symbolClass/symbols.csv` (`<id>;"<Class>"`, id 0 is the root timeline).
- `-swf2xml <swf> <out.xml>` dumps every tag. This is the only timeline source; there is no timeline export. Root element carries `_xmlExportMajor`/`_xmlExportMinor` (4.2 today) and FFDec warns the structure is not final, so check the version.
- In the XML, placements are `PlaceObject2Tag` items with `depth`, `characterId`, `name`, `placeFlagMove`, and a `matrix` child in twips (divide by 20 for pixels). Sprites are `DefineSpriteTag` with `subTags`. Frames end at `ShowFrameTag`.
- Shape SVGs wrap the paths in a `<g transform="matrix(1,0,0,1,tx,ty)">` that shifts the shape so its bounds start at 0,0. The paths inside the wrapper are already in shape-origin coordinates. Convert strips the wrapper and records (tx, ty) as the origin in Scene_JSON (used for bounds); the runtime does not shift.
- Decompiled classes for timeline symbols call `addFrameScript(0,this.frame1,1,this.frame2)` (0-based index) in the constructor and carry an `[Embed(...)]` metadata line to drop.
- `-header <swf>` prints stage size, frame rate and frame count. `-dumpSWF <swf>` lists tags.
- Licence: FFDec is GPLv3. We call it as a separate process and do not link or bundle its code into ours. Whether it can ship inside the hosted container image is still to be decided.

## Open items to confirm
- FFDec in the hosted container: GPLv3 obligations when distributing an image that includes it.
- How to drive Ruffle frame export headlessly.
- FFDec can also export frames as HTML5 Canvas (`frame:canvas`). Know this when describing what is new in our project.
