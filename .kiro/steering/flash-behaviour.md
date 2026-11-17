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
- **`enterFrame`, `frameConstructed` and `exitFrame` are broadcast in registration order.** Each object
  that adds a listener for one of the three types goes to the end of that type's list the first time,
  and delivery walks the list: any display object and the Stage_Object take part, on the display list or
  not. A frame step is A advance (post-order, per top: the root, then each Stage child), B `enterFrame`,
  C `frameConstructed`, D frame scripts (root first), E `exitFrame`. Read again in Ruffle at the commit
  above: `core/src/avm2.rs` `register_broadcast_listener` (pushes a weak reference unless the same
  object is already in the bucket; ignores types outside `BROADCAST_WHITELIST`) and `broadcast_event`
  (loops over `0..len` taken before the loop, so a registration during delivery waits for the next
  event; drops only dead references afterwards). Read earlier and not read again here: `core/src/frame_lifecycle.rs`,
  `core/src/display_object/stage.rs`. The Shim differs in one point: it drops an object whose listeners
  are all removed, so a later registration goes to the end (as3-coverage Open_Item O3). Code:
  `runtime/broadcast.ts`, `shim/internal.ts` `stepTops`. Existing samples keep their scores (children
  register before their parents, so the order equals the old post-order there): measured before and after
  for all ten committed samples (as3-coverage task 10.3).
- **Hit_Target over Stage children.** One hit view per top; tops are tried from the highest index down,
  the root clip last. Only the root clip is never a target (`resolveHitTarget(hits, stage, rootClip)`);
  a Stage child can be. Follows the rule above (Ruffle `mouse_pick_avm2`); the cross-top order is the
  display order of the Stage's children, not read separately in Ruffle.

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

## Name resolution (translation)
- **A bare identifier in an instance method resolves to an inherited instance member before a
  same-named static.** Two passes: every instance member along the chain (translated classes, then the
  Shim chain), then the statics. A static method still resolves to the static. Evidence: the scope order
  (innermost scope first, so the instance `this` scope before the class static scope) was read in Ruffle
  `core/src/avm2/scope.rs` (`ScopeChain::find` iterates `scopes.iter().skip(1).rev()`) at the commit
  named above. That `this` is pushed above the class scope is AVM2 convention and was NOT read or
  measured: Open_Item O4, to be confirmed by the `entity_game` Play_Test. Code:
  `src/translate/memberTables.ts` `lookupMember`. Scores before and after (task 12, `--verify`):
  `entity_game` Overall_Match 100.00 / Trace_Score not-compared / 18 type errors in both;
  `clickgoto` 100.00 / 100.00 / 0 in both. The 18 errors are unchanged in count; the six
  `Game.stage` statements now emit `this.stage`.

## Dictionary
- **`Dictionary` keys objects and functions by identity, strings and numbers by value; `weakKeys` is ignored.**
  Built on `Map` (SameValueZero). Neither read in Ruffle nor measured: it follows as3-coverage
  Requirement 13 and design D10. Open_Item (task 30): read `core/src/avm2/object/dictionary_object.rs` at the
  commit above, and check that a string key and a number key of the same text stay two entries (Flash uses
  strict equality for non-string keys). `Dictionary.set` returns the value, so an assignment used as an
  expression keeps its value. The index syntax on a typed receiver is rewritten by the translator
  (`src/translate/rewrite.ts`); `for (k in d)` and `for each` over a Dictionary are not handled.

## Graphics
- **A fill still open at the end of the commands is drawn, and `drawPath` with only a line style stays an
  open stroke.** Flash fills at render time, so `beginFill` without `endFill` still shows the shape; a path
  drawn with `lineStyle` and no `beginFill` is not closed. Evidence: neither read in Ruffle nor measured
  against Flash (the local `.work/ruffle-src` copy was empty at task 15); it follows as3-coverage
  Requirements 14.5 and 14.6 and design D11. Open_Item (task 30): read Ruffle `core/src/drawing.rs` at the
  commit above (pending fill closed in the render pass). Code: `template/runtime/graphicsPlan.ts`.
- **Line thickness scales with the object (default `LineScaleMode.NORMAL`); graphics draw below the
  object's children.** Evidence for Flash: neither read nor measured (Requirement 14.7, 14.8; Open_Item for
  task 30). What was measured is our runtime only: `test/e2e/graphics.e2e.test.ts` (headless Chromium,
  PixiBackend) shows a 4 pixel line in a sprite scaled by 2 covering 8 rows and a timeline child drawn over
  the parent's circle. Lines use round caps and joins (Flash default, not read); `lineStyle` arguments after
  `color` are ignored (Named_Limit `lineStyle-args`).

## Scenes and labels
- **currentLabel is the nearest label at or before currentFrame, not the label of the exact frame.** Null before
  the first label. Neither read in Ruffle nor measured (`.work/ruffle-src` was empty at task 24, and no cheap
  Playwright measurement against the installed web player was made): it follows as3-coverage Requirement 21.1 and
  design D17 (`get_current_label` / `current_label()`), which cite Ruffle `movie_clip.rs` from an earlier
  reading. Not verified. Code: `template/shim/timelineLookup.ts` `nearestLabel`.
- **currentFrame is scene-relative; 	otalFrames is not.** `frame - firstFrame + 1` of the scene that holds the
  frame. Neither read nor measured here; not verified. One scene at frame 1 gives the old value.
- **gotoAndStop(frame, scene) / gotoAndPlay: a number is added to the start of the named scene, or of the
  current scene when none is named; a label is global; an unknown scene throws ArgumentError** (also when
  `frame` is a label). Neither read nor measured here; not verified (Open_Item for task 30).
  Code: `timelineLookup.ts` `resolveGotoTarget`. An out-of-range number still warns and leaves the clip alone.
- **Scene_JSON ormatVersion 3 carries scenes on the root** (`DefineSceneAndFrameLabelDataTag`: `sceneOffsets`
  0-based, `sceneNames`; FFDec 26.4.0, seen in the spacer dump). The reader accepts 2 and 3; version 2 reads as one
  scene `Scene 1` at frame 1. The writer always writes 3.

## Timer
- **Timers fire from the Player clock, after the frame steps of `Player.update`, at `clock.now()`.** Rules read
  in Ruffle earlier (design "Timer"), not re-read here (`.work/ruffle-src` was empty at task 25): an interval
  below 10 ms is scheduled at 10 ms (`MIN_INTERVAL`) and `delay` reads back unchanged; a timer fires only when
  `tick_time < cur_time` strictly and its next due time is the old one plus the interval; one update fires at
  most 10 times (`MAX_TICKS`, counted over all timers; the model has one timer); `update_timers` runs after the
  frame loop; `start()` on a timer whose `currentCount >= repeatCount > 0` fires once and then completes;
  `TIMER_COMPLETE` is dispatched after `running` is false; `new Timer` with a negative or non-finite delay
  throws `RangeError` (error 2066). Files named in the design: `core/src/timer.rs`,
  `core/src/avm2/globals/flash/utils/Timer.as`, `core/src/player.rs`.
- **Not read, chosen by us (not verified):** setting `delay` on a running Timer restarts the interval and keeps
  `currentCount`; lowering `repeatCount` to at most `currentCount` stops a running Timer without an event; a
  `TIMER` listener that stops the Timer suppresses `TIMER_COMPLETE` for that tick; timers tie-break by
  creation order. Code: `template/runtime/timers.ts`, `template/shim/Timer.ts`.
