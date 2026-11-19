# Tech Stack

Status: unpack, convert, translate, emit and verify are built; UI and hosting are not. The render path is Shape_JSON (one shape JSON per symbol, drawn by the runtime on PixiJS) with gradients, bitmap fills, colour offsets (ColorMatrixFilter, the alpha add term is stripped), strokes, static text as shapes, filters and blend modes kept with limits, and trivial masks as clip groups. Scene_JSON is formatVersion 3, or 4 when the scene holds a button symbol (`{ type: 'button', className?, trackAsMenu, states: { up, over, down, hit } }`, built by `src/convert/buttons.ts`); the reader accepts 2, 3 and 4. The Runtime draws button symbols (SimpleButton in the Shim, state from the pointer) and delivers hover, roll and click events to them; the limits are listed in unsupported-features.json (utton-sound). Translation resolves package-qualified classes, models the Stage_Object, adds implicit `this` from the generated Shim_Member_Table (`npm run gen:shim-members`) and has a class fallback for classes it cannot translate. Verify compares against Reference_Frames that FFDec renders (Ruffle is not used) and writes a fidelity report with a residual register. The `static_text` and `spacer` samples are fetched, not committed (`npm run fetch:static-text`, `npm run fetch:spacer`). `npm test` runs `scripts/runTests.ts`, two vitest phases. Update this file as tooling is added, and verify commands against `package.json` before relying on them.

## Stack
- Language: TypeScript (strict) for the pipeline, runtime, and emitted projects. The repo's `typescript` is 7.0.2 (`tsc`).
- In-process type-check: `typescript-js` is an alias for `typescript@6.0.3`. TS 7 has no in-process `createProgram`; 6.0.3 is the last JS release that does. Only `src/translate/tsSyntaxCheck.ts` and `src/translate/typeCheckGate.ts` import it.
- Emitted projects: Vite + TypeScript + PixiJS.
- Unpack: FFDec (JPEXS) CLI, run as a separate process. Do not write a SWF parser.
- Verify: Ruffle renders the original; headless Chromium renders the output. Compare with SSIM or pixelmatch with anti-aliasing tolerance.
- LLM: used only in the repair loop (type-check errors, renaming `_loc1_`-style placeholders, short comments), with a bounded retry count.
- Tests: property-based (e.g. fast-check) plus unit tests.

## Pipeline
`unpack (FFDec) -> convert (SVG/PNG/audio/timeline JSON) -> translate (AS3 -> TS) -> emit (Vite+Pixi project)`, then the in-process type-check gate on the emitted files. `verify` (FFDec Reference_Frames vs the output rendered in headless Chromium) runs with `--verify` and writes `fidelity-report.json` and `fidelity-report.html`; the web app and hosting are planned.

Outputs next to the project: `unsupported-features.json` and `translation-report.json`. Type errors are reported, not fatal.

### Run_Limits, Outcome_File and exit codes
- Three limits, each set by an option, else a variable, else the default (`src/pipeline/limits.ts`). A value that is not a positive integer is a usage error (exit 2).

  | Option | Variable | Default |
  |---|---|---|
  | `--max-size <MiB>` | `SWF_RESURRECT_MAX_SIZE_MIB` | 20 |
  | `--run-limit <seconds>` | `SWF_RESURRECT_RUN_LIMIT_S` | 300 |
  | `--stage-limit <seconds>` | `SWF_RESURRECT_STAGE_LIMIT_S` | 60 |

  A stage's allowance is the stage limit times its weight: recover 2, unpack 3, convert 1, translate 1, emit 1, gate 1, verify 3 (allowances 120, 180, 60, 60, 60, 60 and 180 s, 720 s in all; the 300 s run limit is the tighter bound and no allowance exceeds it). Unpack runs `-swf2xml` and `-export shape,script,text` at the same time (D-E3). The guard (`src/pipeline/guard.ts`) abandons a stage that passes its allowance or the run limit, kills the registered child processes (`processTree.ts`) and ends the run `refused time-limit`. A blocked synchronous stage still cannot be interrupted (Open_Item O1).
- Every run writes `outcome.json` (the Outcome_File) in the output directory and prints one Outcome_Line (for example `Outcome: refused time-limit ...` or `Outcome: converted-with-gaps - 19 of 27 classes translated, ...`). Fields, reason codes and examples are in `docs/outcome.md`.
- Exit codes: 0 `converted` or `converted-with-gaps`, 1 `failed`, 2 usage or path error, 3 `refused`.

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
npm test -- --run           # scripts/runTests.ts: main vitest run, then launchChromium.e2e alone
npm run gen:shim-members    # regenerate src/translate/shimMembers.generated.ts from template/shim/ (stubs/ included)
npm run gen:api-stubs       # write template/shim/stubs/<Class>.ts from the `stub` entries of src/translate/flashApiTable.ts; run gen:shim-members after it
npm run test:local-files    # on request only: runs test/e2e/localFiles.e2e.test.ts on .work/judge-test/*.swf (about 90 s for redball4); writes .work/robustness-local/summary.md; the default suite skips it and never reads .work/judge-test/
npm run fetch:static-text   # fetch the static_text sample into .work/ (never committed)
npm run fetch:spacer [-- <path>]   # download the spacer release SWF (GPL-3.0) into .work/, or copy a local file; SHA-256 checked, exit 1 mismatch, 2 download failed, 3 unreadable path
npm run pipeline -- <in.swf> <outdir> [--force] [--verify] [--verify-frames <n>] [--reference-dir <dir>] [--max-size <MiB>] [--run-limit <s>] [--stage-limit <s>]   # tsx src/pipeline/cli.ts
```
Inside an emitted project (`out/<sample>`): `npm install`, `npm run dev` (run manually, do not block on it), `npm run build`, `npm run typecheck`.

## FFDec (checked by hand, 2026-11-11)
- Version 26.4.0, zip release from github.com/jindrapetrik/jpexs-decompiler, unpacked to `tools/ffdec/` (gitignored, never committed). Needs Java 17+.
- Run as `java -jar tools/ffdec/ffdec-cli.jar <args>`. Output contains ANSI colour codes; strip them before parsing.
- `-export shape,script,symbolClass <outdir> <swf>` writes `shapes/<id>.svg`, `scripts/<Class>.as`, `symbolClass/symbols.csv` (`<id>;"<Class>"`, id 0 is the root timeline). Unpack asks for `shape,script,text` only: nothing reads the csv since the class links come from the dump (`-format text:svg` for the texts).
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
