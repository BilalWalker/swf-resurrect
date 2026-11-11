# Project Structure

Status: only `docs/`, `LICENSE`, and `.kiro/` exist today. Layout below is planned; adjust as code lands.

## Current
```
.kiro/steering/   Steering rules (committed, never gitignored)
docs/brief.md     Project brief and source of truth for scope
LICENSE
```

## Planned repo layout (tool itself)
- Pipeline stages as separate modules: unpack, convert, translate, emit, verify. Each stage takes explicit inputs and outputs so it can be tested alone.
- Web app (drag-in SWF, stage progress, side-by-side preview, zip download, fidelity report).
- `samples/`: 3-4 SWFs, each with a provenance/licence note.
- `.kiro/specs/`, `.kiro/hooks/`: specs in order `vertical-slice`, `translate`, `verify`, `ui`, `hosting`.

## Emitted project layout (what we generate)
```
runtime/   Timeline player on PixiJS
shim/      Small Flash API layer (DisplayObject, Sprite, MovieClip, events, TextField, Sound)
src/       Translated game code
assets/    SVG, PNG, audio, scene JSON
```

## Rules
- Keep the shim surface small and as listed in `docs/brief.md`; translated code should stay close to the original AS3.
- Symbols linked to classes: runtime instantiates the linked class and binds named stage instances to its properties.
- Build order: vertical slice (timeline + one click handler, no UI/LLM/verify), then shim and transpiler, LLM repair, verify, UI/hosting, polish. Cut order if behind: touch controls, arbitrary upload, sound.
- Do not commit third-party SWFs without a licence.
