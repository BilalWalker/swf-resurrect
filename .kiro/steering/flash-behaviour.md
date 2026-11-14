---
inclusion: fileMatch
fileMatchPattern: ["template/**/*.ts", "src/convert/**/*.ts", "src/verify/**/*.ts", "test/unit/**/*.ts"]
---

# Flash behaviour the runtime must match

Loaded when you work on the runtime, the Shim, Convert or Verify. Every item was measured against
a reference trace or read in Ruffle's source at commit
`4a8d39661ed8aec97afee1504a4e33080da2efd0`, after a first reading that was wrong. Do not change
one of these from memory of how Flash "should" work: read the Ruffle source again or measure, and
say which you did. The spec that holds the evidence is named with each item.

## Display list and timeline

- **Children advance before their parent.** Frame advance walks the tree post-order; a root-first
  walk loses clicks in clickgoto (verify spec, task 18).
- **Named children exist before class code runs.** The `Sprite` constructor builds the frame 1
  children and assigns the named ones before the subclass constructor body and its field
  initialisers. Ruffle does this in `Sprite.as` via `constructChildren`. It is in `Sprite`, not
  `MovieClip`: a linked class that extends `Sprite` needs it too (breadth, Requirement 24).
- **Uninitialised fields are emitted with `declare`.** The target is ES2022, so a plain field
  declaration would overwrite a child that the base constructor already bound.
- **Instance names.** An unnamed object gets `instanceN` from one counter per player, starting at
  0, in depth-first creation order. The root takes a number and is then named `root1`. A named
  placement takes no number (breadth, Requirement 28).
- **Printing.** A display object prints as `[object ClassName]` from the registered class name,
  never `constructor.name` (a minified build would print mangled names).

## Pointer events

- **A Shape is never an event target.** The target is an InteractiveObject. A container tries its
  interactive children first and its shapes second, so a shape above a clip does not hide the
  clip. The root clip is never the target; the Stage is. This is Ruffle `mouse_pick_avm2`
  (`core/src/display_object/movie_clip.rs`) and `Avm2MousePick::combine_with_parent`
  (`core/src/display_object/interactive.rs`); breadth, Requirement 29.2.
- **`mouseChildren = false`** makes the container the target for hits on its children.
  **`mouseEnabled = false`** passes the hit on to the parent.
- **Click needs the same target for press and release.** Press and release are separate events
  and can land in different ticks; a clip may swap its child shape in between and the click must
  still fire on the clip.

## Errors

- A constructor, frame script or listener that throws does not stop the movie. The error is
  reported to the error sink (`console.error` by default, never the trace), the next listener
  still runs, and a clip whose constructor threw stays on the display list (breadth,
  Requirement 25).
- Code that runs when a module is imported (static initialisers, top-level statements) cannot be
  caught this way. A class with any type error in such code is left out of the registry by Emit.

## FFDec and PixiJS facts

- SWF coordinates are twips: 20 per pixel.
- FFDec's shape SVG wraps the paths in `<g transform="matrix(1,0,0,1,tx,ty)">`. The paths are
  already in shape-origin coordinates. Convert removes the wrapper (`flattenSvgWrapper`) and keeps
  the origin in the Scene_JSON; the backend must not shift by the origin again (verify spec,
  task 17).
- PixiJS 8.22 `Graphics.svg()` ignores `transform`, `gradientTransform`, `spreadMethod`,
  `stop-opacity`, `<pattern>`, `<image>`, `<use>` and stroke caps and joins. Anything that needs
  them is drawn from Shape_JSON with the Graphics API instead (breadth design).
- A SWF may have no SymbolClass tag at all, and text, button and bitmap tags define character ids
  that placements refer to.
- FFDec's XML names marked `UNVERIFIED` in `src/convert/ffdecXml.ts` must not be trusted without a
  dump that shows them. Use the `swf_find_tags` tool of the swf-inspector MCP server to look.

## Measuring

- A line break in a reference trace is a real `trace("")`. Only a reference with zero lines is an
  empty reference.
- A Ruffle `input.json` tick is one frame when the test has no `tick_rate`.
- Score floors only go up. Tolerance, reference files and golden translations do not change to
  make a number better. A sample under 100 names its cause in the report.
- AS3 `x as T` returns null on a mismatch. The translation is a plain cast today; this is a known
  gap, not settled behaviour.
