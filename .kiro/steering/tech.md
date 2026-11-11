# Tech Stack

Status: greenfield. Only `docs/brief.md` exists so far. Update this file as tooling is added, and verify commands against `package.json` before relying on them.

## Stack (planned)
- Language: TypeScript (strict) for the pipeline, runtime, and emitted projects.
- Emitted projects: Vite + TypeScript + PixiJS.
- Unpack: FFDec (JPEXS) CLI, run as a separate process. Do not write a SWF parser.
- Verify: Ruffle renders the original; headless Chromium renders the output. Compare with SSIM or pixelmatch with anti-aliasing tolerance.
- LLM: used only in the repair loop (type-check errors, renaming `_loc1_`-style placeholders, short comments), with a bounded retry count.
- Tests: property-based (e.g. fast-check) plus unit tests.

## Pipeline
`unpack (FFDec) -> convert (SVG/PNG/audio/timeline JSON) -> translate (AS3 -> TS) -> emit (Vite+Pixi project) -> verify (Ruffle vs output)`

## Conventions
- Transpiler is deterministic: same input gives same output. Syntax rewrite in code first (`package`/`import` to ES modules, `int`/`uint`/`Number` to `number`, `Vector.<T>` to `T[]`, `for each` to `for...of`, `is`/`as`), LLM second.
- Run `tsc` on translated code; feed errors back to the LLM for a bounded number of retries; flag leftovers in the report.
- Shapes via FFDec SVG export; bitmaps PNG; sounds MP3/OGG; timeline as per-frame display list JSON (depth, symbol id, matrix, colour transform, instance name, labels). Tweens are already baked into placements.
- Compare only deterministic content (timeline frames, scripted-input states). Free-running random play is reported as "not compared".
- Exact pixel equality is not a goal.

## Common commands
No build system exists yet. Expected once scaffolded (confirm in `package.json`):
```
npm install
npm run dev        # Vite dev server (run manually, do not block on it)
npm run build
npm run typecheck  # tsc --noEmit
npm test -- --run  # single run, no watch mode
```

## Open items to confirm
- FFDec licence terms for bundling in a hosted container.
- How to drive Ruffle frame export headlessly.
