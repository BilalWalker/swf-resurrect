# Project brief: SWF Resurrect

Entry for Kiroween 2026 (Devpost), Resurrection category.
Deadline: Dec 4, 2026, 2:00 PM Pacific. Project started after Oct 30, 2026.

## One-line pitch

Ruffle plays old Flash files. We turn them back into source. Drop in a
`.swf`, get a readable TypeScript web project that runs in any browser
(including phones), plus a fidelity report showing how closely it matches
the original.

## Who it is for

- Creators who lost their original `.fla` / source and only have the SWF.
- Archivists and educators holding Flash games, e-learning modules and
  museum interactives that can currently only be emulated, never edited.

## Why it is not just a Flash player

Ruffle emulates a sealed file. JPEXS FFDec exports the pieces but not a
runnable project. We produce a maintainable, modern codebase and prove
how faithful it is. Position it as "sealed SWF in, verified project out".
Do not claim to be the first or only AS3-to-web tool (Apache Royale and
OpenFL exist in neighbouring territory).

## Pipeline

```
game.swf
  -> 1. Unpack     FFDec CLI: shapes, images, sounds, fonts, AS3, timeline
  -> 2. Convert    shapes -> SVG, bitmaps -> PNG, timeline -> JSON scene data
  -> 3. Translate  AS3 -> TypeScript (deterministic transpile, then LLM repair)
  -> 4. Emit       Vite + PixiJS project using our runtime and Flash API shim
  -> 5. Verify     render frames in Ruffle and in the output, compare images
```

### 1. Unpack

Call the FFDec command line as a separate process. We do not write a SWF
parser. FFDec and Ruffle are disclosed third-party dependencies.

### 2. Convert

- Vector shapes: use FFDec's SVG export.
- Bitmaps: PNG. Sounds: MP3/OGG.
- Timeline: per-frame display list (depth, symbol id, matrix, colour
  transform, instance name, labels) written as JSON. Classic tweens are
  already baked into per-frame placements in the SWF, so playback is a
  matter of applying each frame's placements.

### 3. Translate

Two passes, in this order:

1. Deterministic syntax rewrite in code: `package`/`import` to ES modules,
   `int`/`uint`/`Number` to `number`, `Vector.<T>` to `T[]`,
   `for each` to `for...of`, `is`/`as`, access modifiers, default params.
2. LLM repair loop only for what remains: type-check with `tsc`, feed
   errors back, retry a bounded number of times. The LLM also renames
   decompiler placeholders such as `_loc1_` to meaningful names and adds
   short comments.

Anything that still fails to compile is flagged in the report, never
hidden.

### 4. Emit

A normal Vite + TypeScript project:

- `runtime/` : timeline player on PixiJS.
- `shim/`    : small Flash API layer so translated code stays close to
               the original.
- `src/`     : translated game code.
- `assets/`  : SVG, PNG, audio, scene JSON.

Extra, as the "reimagined" feature: optional on-screen touch controls
mapped to the keys the game listens for, so the result is playable on a
phone.

### 5. Verify

- Original: rendered by Ruffle. Output: rendered in headless Chromium.
- Compare at fixed frame numbers with a perceptual metric (SSIM or
  pixelmatch with anti-aliasing tolerance). Different rasterisers never
  match pixel for pixel at edges, so exact equality is not the goal.
- Only deterministic content is compared frame by frame: timeline
  animation, and game states reached by a fixed scripted input sequence.
  Free-running interactive play with randomness is out of scope for the
  metric and reported as "not compared".

## Scope decisions (fixed)

- ActionScript 3 only. No AS1/AS2.
- PixiJS for rendering, not plain Canvas.
- Deterministic transpile first, LLM second.
- Hosted demo is gallery-first: pre-converted samples always work;
  arbitrary upload is available with size and time limits and fails
  with a clear report.
- A clear "unsupported feature" list in every report. No silent failure.

## Flash API shim: supported surface (initial)

- `DisplayObject`: x, y, scaleX, scaleY, rotation, alpha, visible,
  width, height, parent, name.
- `DisplayObjectContainer` / `Sprite`: addChild, removeChild,
  getChildByName, numChildren.
- `MovieClip`: play, stop, gotoAndPlay, gotoAndStop, currentFrame,
  totalFrames, frame labels, frame scripts.
- Symbols linked to classes: the runtime instantiates the linked class
  and binds named stage instances to its properties.
- Events: `ENTER_FRAME`, mouse click/down/up/move, keyboard down/up,
  addEventListener / removeEventListener.
- `hitTestObject` (bounding box), `getTimer`, `Math`, `Stage` size and
  frame rate.
- `TextField`: dynamic text with a web font fallback.
- `Sound`: play, stop.

## Out of scope

Stage3D, video, networking, filters, blend modes, morph shapes (shape
tweens), masks unless trivial, bitmap data manipulation, E4X/XML,
embedded-font exact metrics, large class hierarchies, commercial games.

## Sample files

Three or four SWFs only, each with documented provenance in the repo:

1. Pure timeline animation (no code).
2. Animation with one click handler.
3. Small keyboard game (move, collide, score text, sound).

Use permissively licensed open-source Flash projects or files whose
author has given written permission. Never commit third-party SWFs
without a licence. Prefer at least one sample whose original source is
genuinely lost.

## User-facing app

Web app: drag in a SWF, watch the pipeline stages progress, then get

- side-by-side preview: original (Ruffle) vs converted,
- downloadable project zip,
- fidelity report: per-frame scores, diff images, unsupported features.

## Hackathon constraints that affect the build

- `/.kiro` at repo root (specs, hooks, steering), committed, not ignored.
- Public GitHub repo with an open-source licence shown in About.
- Hosted URL that judges can use for free.
- Demo video under 3 minutes; no third-party logos or copyrighted music.
- Write-up of how Kiro was used.

## Kiro usage plan

- Specs: `vertical-slice` first, then `translate`, `verify`, `ui`,
  `hosting`.
- Steering: product, tech, structure, plus shim contract, SWF quirks and
  project rules.
- Hooks: type-check on save; regenerate fidelity report when pipeline
  code changes.
- MCP: FFDec inspector and Ruffle frame renderer as tools.
- Property-based tests: asset counts preserved through conversion;
  timeline JSON round-trips; translated code compiles or is flagged;
  transpiler output is stable (same input, same output).
- Kiro CLI for at least one workstream, to compare with the IDE.

## Build order

1. Vertical slice: one SWF with a timeline animation and one click
   handler, played by the PixiJS runtime. No UI, no LLM, no verify.
2. Shim and transpiler for the keyboard game sample.
3. LLM repair loop.
4. Verify harness and report.
5. Web UI, then hosting.
6. Touch controls, polish, video, write-up.

Cut order if behind: touch controls, arbitrary upload (keep gallery),
sound.

## To confirm before relying on it

- FFDec licence terms for bundling it in a hosted container.
- Ruffle's frame export tool and how to drive it headlessly.
- Exact wording of the hackathon rules on "meaningful Kiro use".
