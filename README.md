# SWF Resurrect

Flash Player reached its end of life on 31 December 2020. Its files did not have to.

SWF Resurrect takes a compiled Flash file (`.swf`, ActionScript 3) and gives back a
**readable TypeScript + Vite + PixiJS project** that runs in any modern browser, together
with a **fidelity report** that measures how closely the result matches the original, frame by
frame and trace line by trace line.

An emulator such as Ruffle plays a sealed file. A decompiler such as JPEXS FFDec exports the
pieces. SWF Resurrect produces a project you can open, read, change and build, and tells you
honestly what it could not carry over.

Built for [Kiroween 2026](https://kiroween.devpost.com/), Resurrection category.

## What you get

```
my-game.swf  ->  out/my-game/
                   src/            your classes, translated to TypeScript, same names and packages
                   shim/           a small Flash API layer (DisplayObject, Sprite, MovieClip, events, ...)
                   runtime/        timeline player on PixiJS
                   assets/         shapes, bitmaps and scene data
                   translation-report.json    every class: clean, loose, unsupported, omitted, and why
                   unsupported-features.json  everything that was not carried over, by name
                   fidelity-report.html       the proof: reference frame, our frame, difference, scores
```

Two scores, both measured, never estimated:

- **Overall match**: sampled frames of the output, rendered in headless Chromium, compared
  pixel by pixel with reference frames of the original SWF.
- **Trace score**: a recorded input session is replayed on the output and its `trace()` lines are
  compared with the original's recorded output.

A score below 100 always comes with the named cause. Nothing is drawn or translated
"approximately" without the report saying so.

## How it works

```
.swf
 -> Unpack      FFDec (separate process): structure dump, shapes, decompiled AS3
 -> Convert     timeline -> scene JSON, shapes -> draw data, text, bitmaps, masks
 -> Translate   AS3 -> TypeScript, deterministic (tokenizer, scanner, rewriter); no LLM in the loop
 -> Emit        a Vite + PixiJS project from template/ plus the translated classes
 -> Type check  the emitted project is type checked; each class is clean, loose or left out
 -> Verify      reference frames vs Chromium frames, input replay vs recorded trace
```

The translation is deterministic: the same SWF gives byte-identical output on every run.

## Run it

Requirements:

- Node.js 24 or newer, then `npm ci`
- Java 17 or newer
- [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) 26.4.0:
  download `ffdec_26.4.0.zip` from its releases page and unzip it to `tools/ffdec/`
  (so that `tools/ffdec/ffdec-cli.jar` exists). It is not bundled; see Licences.
- For `--verify`: Chromium for Playwright, `npx playwright install chromium`

Command line:

```
npm run pipeline -- samples/clickgoto/test.swf out/clickgoto --verify
cd out/clickgoto && npm install && npm run dev
```

Options: `--force`, `--work-dir <dir>`, `--keep-work`, `--ffdec <jar>`, `--handwritten <dir>`,
`--verify`, `--verify-frames <n>`.

Web app (drop a file, watch the stages, compare original and result side by side, read the
report, browse the generated code, download the project):

```
npm run web        # http://127.0.0.1:5180
```

See [web/README.md](web/README.md).

Container (everything above in one image, samples converted at build time, port 7860):

```
docker build -t swf-resurrect .
docker run --rm -p 7860:7860 swf-resurrect
```

Tests:

```
npm run typecheck && npm run typecheck:template && npm run typecheck:web
npm test -- --run
```

## What is supported today

Works: the display list and timelines, linked classes, frame scripts, mouse events with
Flash's target rules, shapes with solid, gradient and bitmap fills, strokes, masks, static
text, colour transforms, packages and interfaces, class members resolved without `this`.

Not yet: dynamic text fields, buttons, morph shapes, most filters, sound, keyboard input,
`Timer`, the drawing API (`graphics`), and several language constructs (`try`, `delete`,
`with`). Each of these is reported by name when a SWF uses it. ActionScript 1 and 2 are out of
scope.

The samples under `samples/` each have a `PROVENANCE.md` with their source, licence and
checksum.

## Built with Kiro

The engine was built spec-first in Kiro. Everything Kiro worked from is in the repository:

- `.kiro/specs/`: requirements, design and task lists for each stage of the build
- `.kiro/steering/`: product, tech and structure rules, the git workflow, and a page of
  verified Flash behaviour that loads only when runtime files are in play
- `.kiro/hooks/` with `scripts/hooks/`: three shell-command hooks (blocked git commands,
  regenerated tables and sample checks after a write, commit checks after a task)
- `.kiro/settings/mcp.json` with `mcp/swf-inspector/`: an MCP server that lets the agent look
  inside a SWF in one call, plus the Playwright server for looking at results in a browser
- `.kiro/agents/fidelity-reviewer.md`: a read-only agent that reviews checkpoints
- `test/property/`: property-based tests (fast-check) next to the unit tests

## Licences

- This project: MIT, see [LICENSE](LICENSE), except `handwritten/spacer/`, which is GPL-3.0 because it adapts code from Spacer.
- JPEXS Free Flash Decompiler (FFDec): GPL-3.0. It is called as a separate program, never
  linked or copied, and is not part of this repository. The container image downloads the
  official release unmodified into its own directory; see [THIRD_PARTY.md](THIRD_PARTY.md).
- Ruffle: MIT OR Apache-2.0. The web app uses the Ruffle web player to show the original SWF;
  some samples and their recorded traces come from Ruffle's test suite. See
  [web/THIRD_PARTY.md](web/THIRD_PARTY.md) and `samples/LICENSES/`.
- PixiJS (MIT), Vite (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0).

"Flash" and "ActionScript" are trademarks of Adobe. This project is not affiliated with Adobe.
