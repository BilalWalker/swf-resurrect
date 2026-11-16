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
## Utility functions
- **`getTimer()` counts from Player construction.** It returns `floor(clock.now() - startTime)` from
  the Player clock. Neither read in Ruffle nor measured: it follows as3-coverage Requirement 12.4 and
  the design. Real Flash counts from the start of the runtime; with one movie per Player the two agree.
  Open: check Ruffle `core/src/avm2/globals/flash/utils.rs` (`getTimer`) and measure.
- **`getQualifiedClassName` uses the registry name.** Unqualified (`registerClassName` strips the package),
  so a packaged class returns `Name`, not Flash's `pkg::Name`. Neither read nor measured; an unregistered
  class gives the JavaScript function name (Requirement 12.3).
## Events
- **Listener order follows priority; equal priorities keep insertion order; a repeat is ignored.**
  `addEventListener(type, listener, useCapture, priority, useWeakReference)` calls listeners by
  descending `priority` and, inside one priority, in the order added. A listener already present
  at any priority is not added again. Read in Ruffle `core/src/avm2/events.rs` at the commit named
  above: `DispatchList` holds a `FnvHashMap<type, BTreeMap<i32, Vec<EventHandler>>>`, dispatch
  iterates the `BTreeMap` with `.rev()`, and `add_event_listener` returns early when the handler is
  in any priority's `Vec`. Ruffle's handler identity includes `use_capture`; the Shim ignores
  capture (Named_Limit `useCapture-ignored`), so identity is the function alone. (as3-coverage,
  design D5, Requirement 6.)
## Keyboard
- **Key events go to `Stage.focus` when it is a display object on the stage, else to the Stage; they
  bubble; each browser repeat is a further `keyDown`.** `Player.dispatchKey` is the one dispatch
  function. Follows as3-coverage Requirement 5 and design D4; the target rule was not read in Ruffle.
  The Ruffle test injector sends one `KeyDown` per entry and no repeat (design, "Keyboard path").
- **Flash key codes come from the physical key (`event.code`)**: `KeyA`..`KeyZ` 65..90, `Digit0`..`Digit9`
  48..57, arrows 37..40, Enter 13, Escape 27, Space 32; `keyCode` only for an unknown `code`.
  Measured (task 8.4, `test/e2e/keyCodes.e2e.test.ts`, headless Chromium, Playwright key presses):
  for the 14 codes the games read (13, 27, 32, 37, 38, 39, 40, 65, 67, 68, 83, 87, 88, 90) the
  browser `keyCode` and `flashKeyCode` both equal the table. This proves a US layout only (Open_Item O7).
- **Inside an iframe the emitted page gets keys after a click in the frame.** Measured in
  `test/e2e/keyboardIframe.e2e.test.ts` (sandbox="allow-scripts", host never calls `iframe.focus()`).
  Open_Item: web UI parent should call `iframe.focus()` on load (`web/client/src/result.ts`); passed to
  the web owner, not changed here.
