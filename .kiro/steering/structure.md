# Project Structure

Status: unpack, convert, translate, emit and the pipeline CLI exist. Verify, web app and hosting are planned.

## Current repo layout (tool itself)
```
.kiro/steering/   Steering rules (committed, never gitignored)
.kiro/specs/      Specs: vertical-slice, translate (verify, ui, hosting to come)
docs/brief.md     Project brief and source of truth for scope
samples/          SWFs, each with PROVENANCE.md
src/unpack/       FFDec wrapper
src/convert/      FFDec output -> Scene_JSON, assets, unsupported list
src/translate/    AS3 -> TS: tokenizer, scanner, rewrite, emitTs, translate, planTranslate,
                  report, shimNames; IO and typescript-js use only in translateStage,
                  tsSyntaxCheck, typeCheckGate
src/emit/         Writes the Vite+Pixi project from template/ plus translated classes
src/pipeline/     Stage wiring, CLI (npm run pipeline), report writing
template/         Files copied into every emitted project: runtime/, shim/, src/
test/             unit/, property/ (fast-check), e2e/, fixtures/, support/
handwritten/      Optional override directory (see Rules); empty by default
LICENSE
```
Gitignored: `tools/`, `node_modules/`, `out/`, `.work/`, `dist/`.

## Planned
- Verify stage (Ruffle vs output) as its own module with explicit inputs and outputs.
- Web app (drag-in SWF, stage progress, side-by-side preview, zip download, fidelity report).
- `samples/`: 3-4 SWFs in total (two so far).
- `.kiro/hooks/`.

## Emitted project layout (what we generate)
```
runtime/   Timeline player on PixiJS
shim/      Small Flash API layer (DisplayObject, Sprite, MovieClip, Shape, events, trace)
src/       Translated game code, plus classes.ts registering linked classes
assets/    SVG, PNG, audio, scene JSON
```
Planned shim additions: TextField, Sound.

## Rules
- Keep the shim surface small and as listed in `docs/brief.md`; translated code should stay close to the original AS3. Every API added beyond the brief goes in `template/shim/ADDED_APIS.md` with the fixture line that needs it.
- Symbols linked to classes: runtime instantiates the linked class and binds named stage instances to its properties.
- `handwritten/<sample>/` (or `--handwritten <dir>`) is an optional override: a `.ts` there replaces the translated class of the same name if that class is linked or in the emit closure. Others are ignored with a warning. No overrides are committed; tests use translated Fixture_Classes.
- Build order: vertical slice, then shim and transpiler (done), LLM repair, verify, UI/hosting, polish. Cut order if behind: touch controls, arbitrary upload, sound.
- Do not commit third-party SWFs without a licence.
