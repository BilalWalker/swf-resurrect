# Project Structure

Status: unpack, convert, translate, emit, verify and the pipeline CLI exist. The web app and hosting are planned. Scene_JSON is formatVersion 2 and shapes are Shape_JSON. `samples/` holds ten committed samples (clickgoto, tweendemo, radial, gradients, acid-color-2, mask_reapply, click_block, 3_joystick, slider_component, entity_game) and two fetched ones. `static_text` keeps only its PROVENANCE.md and reference files in the repository (`npm run fetch:static-text` downloads the SWF). `spacer` (GPL-3.0) keeps only `PROVENANCE.md` and `reference/test.toml` (`npm run fetch:spacer` downloads the release SWF or copies a local file); its SWF and converted output are never committed.

## Current repo layout (tool itself)
```
.kiro/steering/   Steering rules (committed, never gitignored)
.kiro/hooks/      Agent hooks (shell command actions only)
.kiro/agents/     Custom agents: fidelity-reviewer
.kiro/settings/   mcp.json (swf-inspector, playwright)
.kiro/specs/      Specs: vertical-slice, translate (verify, ui, hosting to come)
docs/brief.md     Project brief and source of truth for scope
docs/outcome.md   The four outcomes, Reason_Codes, exit codes and Outcome_File fields, with one JSON example each (checked by test/unit/outcomeDocs.test.ts)
samples/          SWFs, each with PROVENANCE.md
src/unpack/       FFDec wrapper
src/convert/      FFDec output -> Scene_JSON, assets, unsupported list
src/translate/    AS3 -> TS: tokenizer, scanner, rewrite, emitTs, translate, planTranslate,
                  report, shimNames, implicitThis, importPlan, interfaceDecl, memberTables,
                  shimMembers (+ generated shimMembers.generated.ts); IO and typescript-js use only in translateStage,
                  tsSyntaxCheck, typeCheckGate
src/emit/         Writes the Vite+Pixi project from template/ plus translated classes
src/verify/       core/ (pure: pixel diff, trace compare, residual register, report) and edge/
                  (FFDec Reference_Frames, Chromium render, replay, verifyStage)
src/samples/      Fetched-sample core (static_text)
scripts/          runTests.ts (`npm test`), gen-shim-members.ts, fetch-static-text.ts
src/outcome/      Outcome types and decideOutcome, exit-code table, reason sentences and scrub, gap kinds,
                  Outcome_File writer and parser (outcomeFile.ts; fs is injected, no node:* import)
src/facts/        Facts stage: reads the SWF header and tag counts before any FFDec call (readFacts, swfBody)
src/pipeline/     Stage wiring, CLI (npm run pipeline), report writing;
                  limits.ts (pure Run_Limits resolver), guard.ts (Clock, RunGuard, runStage; pure),
                  realClock.ts (the real Clock), processTree.ts (child registry and tree kill)
mcp/              MCP servers for Kiro: swf-inspector (npm run mcp:swf-inspector)
scripts/hooks/    Scripts run by the hooks in .kiro/hooks/ (plain Node, no tsx)
template/         Files copied into every emitted project: runtime/, shim/, src/ (shim/ includes Stage)
test/             unit/, property/ (fast-check), e2e/, fixtures/, support/
handwritten/      Optional override directory (see Rules); empty by default
LICENSE
```
Gitignored: `tools/`, `node_modules/`, `out/`, `.work/`, `dist/`.

## Planned
- Licence layout: the repository is MIT except handwritten/spacer/, which is GPL-3.0 (the directory does not exist yet; the README line is added in as3-coverage task 28.3). handwritten/SET.json (list of sample, class name, reason) is planned with it.
- Web app (drag-in SWF, stage progress, side-by-side preview, zip download, fidelity report).

## Emitted project layout (what we generate)
```
runtime/   Timeline player on PixiJS
shim/      Small Flash API layer (DisplayObject, Sprite, MovieClip, Shape, events, trace)
src/       Translated game code, plus classes.ts registering linked classes
assets/    SVG, PNG, audio, scene JSON
```
Planned shim additions: Sound.

### Inspection hook and ?play=1 (Play_Tests, as3-coverage Requirement 25)
- Player.inspect() (	emplate/runtime/inspect.ts) is read-only: 	ick, ind(className), stageChildren() giving { className, name, x, y, rotation, visible, frame, label, children }, and 	imers() (empty until the Shim has a Timer). Every value is a plain copy; there is no setter.
- With ?play=1, main.ts uses a ManualClock, runs no 
equestAnimationFrame loop and installs window.__swfPlay = { step(n), key(type, code), click(x, y), render(), inspect(), errors() }; step advances rameIntervalMs per update and renders every 60 steps inside the loop, not after each call; render() draws once and a test calls it before a screenshot or pixel read.
- 	est/support/playDriver.ts (PlayDriver: Node and Chromium) and 	est/support/playScenarios.ts (one scenario per game) feed 	est/e2e/entityPlay.node.test.ts and entityPlay.chromium.test.ts.

## Rules
- Keep the shim surface small and as listed in `docs/brief.md`; translated code should stay close to the original AS3. Every API added beyond the brief goes in `template/shim/ADDED_APIS.md` with the fixture line that needs it.
- Symbols linked to classes: runtime instantiates the linked class and binds named stage instances to its properties.
- `handwritten/<sample>/` (or `--handwritten <dir>`) is an optional override: a `.ts` there replaces the translated class of the same name if that class is linked or in the emit closure. Others are ignored with a warning. No overrides are committed; tests use translated Fixture_Classes.
- Build order: vertical slice, then shim and transpiler (done), LLM repair, verify, UI/hosting, polish. Cut order if behind: touch controls, arbitrary upload, sound.
- Do not commit third-party SWFs without a licence.
