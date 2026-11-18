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

## Bounds and collision
- **`getBounds` of an empty clip is the zero rectangle; a target space other than the object is the box of the
  transformed box.** Read in Ruffle `core/src/avm2/globals/flash/display/display_object.rs` (`get_dobj_bounds`
  returns `Rectangle::ZERO` for invalid bounds) in an earlier session and recorded in the as3-coverage design. Neither
  re-read here (`.work/ruffle-src` is empty) nor measured against the installed web player (a SWF with an empty
  clip and a `getBounds` call needs an AS3 compiler that the repository does not have): Open_Item for task 30.
  Code: `template/shim/bounds.ts` `contentBounds`. Graphics and text boxes are not counted (Named_Limit
  `getBounds-content-ignored`).
- **`pixelsOverlap` ignores `visible` of the two objects and counts a fill of any alpha.** The Flash route draws the
  source with `ColorTransform(1,1,1,1,255,-255,-255,255)`, so the alpha offset makes every drawn fill opaque; a
  partial-alpha fill counts. Reasoned from the `PhysicEngine.as` source, not measured. Whether `BitmapData.draw`
  skips an invisible child of the source was neither read nor measured (Open_Item O5, task 30); no hitbox symbol of
  `spacer` has an invisible child (26.4). Strokes are not counted (Flash counts them): the hitbox shapes of
  `spacer` carry 1 to 2 pixel strokes, so overlaps start about one pixel later than in Flash.
  Code: `template/runtime/overlap.ts`.

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

## Play_Test findings (as3-coverage task 31, spacer)
- **A clip whose enterFrame code removes it on its last frame is never seen on that frame between ticks.** Phase A moves
  the Fly to `destroyedComplete` (frame 51 of 51), the `enterFrame` of `Main` runs `Fly.animateDeath` (stop, `die()`)
  and `LevelScene.removeFly` takes it off the Stage in the same tick. The last snapshot shows frame 50; the next shows
  no Fly of that name. Measured in our runtime only (Node and Chromium Play_Tests); follows from the frame step order
  above, not compared with Flash or Ruffle.
- **Keys reach the emitted page with no click.** Playwright key presses on the top-level `?play=1` page start the spacer
  level without any pointer event (the window listener of `main.ts`, canvas focused on load). Measured in headless
  Chromium (`test/e2e/spacerPlay.chromium.test.ts`). Ruffle needed a click on the player first; that is Ruffle's
  focus rule, not one we copy. Inside an iframe the rule above still applies.
- **`width` / `height` of a Sprite or MovieClip are the box of its transformed content box in the parent space.** Own
  scale and rotation included, 0 for empty content; graphics and text boxes not counted. Neither read in Ruffle nor
  measured against Flash: AS3 documentation behaviour, chosen so `spacer`'s border clamp works. Setting them on a
  content-sized object (container or shape) calls `setContentSize` (`template/shim/bounds.ts`, commit d454386): it solves
  for the scale of the same axis so the getter returns the request. The scale is unchanged for empty content, a 90 or 180
  degree rotation where the axis term is 0, a request below the other axis' contribution, or a non-finite request.
  Neither read in Ruffle nor measured against Flash (O24).
- **`inspect()` `label` is the label on the exact absolute frame; `frame` is scene-relative.** Ours, not Flash's.

## Buttons (robustness task 21.1)
- **State-change table, hit rule.** RollOver to Over, RollOut to Up, Press to Down, Release to Over, ReleaseOutside to
  Up, MouseUpInside to Up, DragOut to Over, DragOver to Down; each event has one target state whatever the old state is.
  The hit region is the shapes of the current state container united with the hit container; with no hit records the
  current state's shapes serve; a pointer event inside a button targets the button (`mouseChildren` false). Evidence:
  read in Ruffle `avm2_button.rs` (`mouse_pick_avm2`) and `player.rs` at `4a8d396` by the robustness design (F4,
  D-C2, D-C3, D-C5); not re-read in task 21.1 (`.work/ruffle-src` is empty). Not measured. Code:
  `template/runtime/buttonModel.ts`.
- **Disabled rule.** A button with `enabled` false ignores every event except key presses (and so does one with
  `visible` false); it is still the pick result, so it hides what lies under it. Evidence: read in Ruffle
  `avm2_button.rs` (`filter_clip_event`) at `4a8d396` by the robustness design; not re-read in task 21.2
  (`.work/ruffle-src` is empty). Not measured. Code: `template/shim/SimpleButton.ts` `dispatchEvent` drops every
  `MouseEvent` while disabled, for the button and so for its parents too (a disabled button hands nothing up).
  The `visible` part is not implemented: an invisible button is not hit (the hit test skips it), which has the same effect.
- **Disabled-button state reset (Open_Item O10).** Ruffle only ignores events; whether `set_enabled` puts the state back
  to Up was NOT read and NOT measured. We choose (design D-C6, not Flash): a disabled button draws its up state, the
  state the model had is kept, and `enabled = true` shows that state again. Label: neither. Code: `SimpleButton._drawnState`.
  To close it, read `set_enabled` in `avm2_button.rs`.
- **Release-outside rule.** `ReleaseOutside` goes to the pressed object, and the object now under the pointer gets
  `RollOver` at once. Evidence: read in Ruffle `player.rs` at `4a8d396` by the robustness design; not re-read and not
  measured. Task 21.2 has no code for it: `Player.dispatchMouseUp` still only reports the pair
  (`PointerOutcome.releaseOutside`); the events and the state change come with task 22.1 and 22.2.
- **What a button draws (task 21.2).** The render list of a button holds one object, the current state; the other states and
  the hit state are not parented. The hit state has no backend node and is never drawn. A button placement takes the
  placement transform of any symbol, and its state container sits at identity inside it. Evidence: the design's reading
  of `avm2_button.rs` (only the current state child is parented, the hit area never is); ours-only for the Player code,
  measured on the FakeBackend in `test/unit/buttonNodes.test.ts`, not compared with Flash. A button state child takes no
  Default_Instance_Name (ours, not Flash's). A clip inside a button state is built but its timeline does not advance
  (the frame walk stops at a button): a limit of task 21.2, not read in Ruffle.

## Hover and roll events (robustness task 22.1)
- **Evidence: read in Ruffle at `4a8d396`** (Open_Item O9 closed). `.work/ruffle-src` held an empty git repo; task 22.1 fetched
  only `core/src/display_object/interactive.rs` and `core/src/player.rs` from raw.githubusercontent.com at that commit
  (read for evidence, gitignored, not a dependency). Not measured against Flash or a running Ruffle.
- **`mouseOver` and `mouseOut` bubble; `rollOver` and `rollOut` do not.** `interactive.rs` `event_dispatch_to_avm2`: `mouseOut`
  and `mouseOver` are built with `bubbles = true`, `rollOut` and `rollOver` with `false`.
- **Roll events are dispatched at every object of a chain, not bubbled.** `RollOut { to }`: `mouseOut` at the object, then
  `rollOut` at the object and each parent up to, not including, `lowest_common_ancestor(object, to)` (the Stage when `to` is none).
  `RollOver { from }`: `rollOver` at the same kind of chain first, then `mouseOver` at the object. So the order is out then roll for
  leaving and roll then over for entering. Moving from a child to its parent gives the child `rollOut` and the parent no `rollOut`.
- **`DragOut` and `DragOver` dispatch exactly like `RollOut` and `RollOver`** in AVM2 (one match arm each). `player.rs`
  `update_mouse_state`, button held and the hovered object changed: `DragOut` at the pressed object when it is the one left,
  `DragOver` when it is the one entered, then `RollOut` at the old and `RollOver` at the new (AVM2 only). So the pressed object
  gets `mouseOut` and `rollOut` twice on a drag-out and `rollOver` and `mouseOver` twice on a drag-over. We copy that; it is
  what the source does, not a measured Flash result.
- **Release outside.** `ReleaseOutside` (AS3 type `releaseOutside`, bubbling) goes to the pressed object, then `RollOver` to the
  object now hovered with `from` = the object hovered before the update. When that is the same object (the usual case, the
  roll events already fired during the drag) the chain is empty: only `mouseOver` fires. Release inside: `MouseUpInside`
  (`mouseUp`) at the hovered object, then `Release` (`click`) at the pressed one.
- **Order against `mouseMove`: Ruffle differs from our task and design.** In `update_mouse_state` the list starts with
  `MouseMoveInside` (the target's `mouseMove`) and the roll events follow, so Ruffle runs the target's `mouseMove` first (the
  Stage-level move runs even earlier in `handle_input_event`). Design D-C4 and task 22.1 say hover events come before
  `mouseMove`; the Player does that (`pointerEntry`: `updateHover`, then `mouseMove`). Open: the owner decides whether to
  match Ruffle; the change is moving one line.
- **Hover is recomputed on every pointer entry** (move, press, release); Ruffle skips it on a tick with no input. The
  Hit_Target is the Stage_Object (no hovered object) outside any interactive object; no event is sent to the Stage for it.
  Not read: pointer leaving the canvas (no event in our Player). Code: `template/runtime/player.ts` `updateHover`, `clipEvent`.

- **Button state from events (task 22.2).** The Player feeds `rollOver`, `rollOut`, `dragOver`, `dragOut`, `press`, `release` and `releaseOutside` into `buttonModel.step` for the button hit, from `clipEvent` and the press and release paths, and `click` follows `release` on the same Pressed_Target. The roll event that follows a drag event of the pressed button is not fed (the model has one target state per event, so `dragOut` then `rollOut` would give up instead of over). A disabled button is skipped. Ours-only (`test/unit/playerButtons.test.ts`, Property 25 through the Player); the skipped roll feed is our choice, not read. A click moves the state before the release, so the hit region of a button whose states differ in place follows the state at each event: tests of the region use the first hover entry.

## Evidence register (as3-coverage task 30)
One list of every Flash behaviour added in the spec, with its label. `read` = read in Ruffle at commit
`4a8d396` (a note says when it was not re-read in task 30; `.work/ruffle-src` is empty and nothing is
downloaded); `measured` = a test or run on this machine; `ours-only` = measured on our runtime, not compared with
Flash or Ruffle; `neither` = reasoned, AS3 documentation, or chosen by us. The open ones are in the Open_Items table
of `.kiro/specs/as3-coverage/design.md` (O-numbers below). Task 30 checked that earlier tasks had already added
broadcast order, Timer, `currentLabel`, scene `currentFrame` and `goto`, `getBounds`, listener order and scope order
above; nothing was missing.

| Behaviour | Label | Open_Item |
|---|---|---|
| Listener order: descending priority, insertion order inside a priority, repeat ignored | read (`events.rs`) | none |
| Broadcast order for `enterFrame`, `frameConstructed`, `exitFrame`; registration during delivery waits | read (`avm2.rs`, re-read); `frame_lifecycle.rs`, `stage.rs` read earlier | O12 |
| Ten sample scores unchanged after the broadcast change | measured | O11 |
| Shim prunes an object with no listener; Ruffle keeps the position | read | O3 |
| Scope search order, innermost first | read (`scope.rs`) | none |
| `this` above the class scope | neither | O4 |
| Hit target: a Shape is never a target, root clip never | read (`mouse_pick_avm2`) | none |
| Timer: 10 ms floor, 10 ticks per update, strict `<`, `delay` unchanged, count-zero restart, RangeError 2066 | read earlier, not re-read | O15 |
| Timer: `delay` setter, `repeatCount` setter, stop inside listener, tie-break, MAX_TICKS over several timers | neither | O23 |
| `getBounds` of an empty clip is the zero rectangle | read earlier, not re-read, not measured | O13 |
| `BitmapData.draw` of an invisible source root; `pixelsOverlap` ignores `visible` | read earlier (root), not re-read | O14 |
| `BitmapData.draw` of an invisible child | neither | O5 |
| `pixelsOverlap` alpha and strokes | neither | O8, O27 |
| Packaged override `a/b/Cls.ts` replaces `a.b.Cls` in Emit | measured (`test/unit/emit.test.ts`, run in task 30) | O16 |
| Key codes for the 14 codes the games read, US layout | measured (Chromium) | O7 |
| Key target: `Stage.focus` else Stage; bubbling; repeats; `Stage.focus` typed as a display object | neither | O25 |
| Ruffle key format for the injector | read earlier (`automation.rs`), not re-read | O26 |
| Keys reach the iframe only after a click; top-level page needs no click | measured (Chromium) | O32 |
| `getTimer()` origin | neither | O17 |
| `getQualifiedClassName` unqualified | neither | O18 |
| `Dictionary` key semantics | neither | O19 |
| Even-odd against non-zero fill; self-intersecting polygons | ours-only | O20 |
| Open fill drawn, open stroke, line scale, graphics below children, round caps | ours-only | O21 |
| Nearest-label `currentLabel`, scene-relative `currentFrame`, scene `goto` | neither (design D17 cites an earlier read) | O22 |
| Container width and height from content; setters via `setContentSize` (scale solved per axis, unchanged in the degenerate cases above) | neither | O24 |
| Static `DefineEditText` (wasStatic and readOnly) drawn as shapes from FFDec's text SVG (Block D); HUD digits compared by eye in `.work` screenshots against Ruffle; text-metrics limit stays | measured by eye | none |
| Removal on the last frame is not seen between ticks (Play_Test) | ours-only | O31 |
| `inspect()` label and frame fields | neither (ours, not Flash's) | none |
| Button state-change table and hit rule (current state union hit state; a hit inside targets the button) | read by the design (`avm2_button.rs`, `mouse_pick_avm2`), not re-read in task 21.1 | none |
| Disabled button ignores every event but key presses | read by the design (`filter_clip_event`), not re-read in task 21.2 | none |
| Disabled button draws Up and keeps the model's state for `enabled = true` | neither (design D-C6) | O10 |
| Release outside: `ReleaseOutside` to the pressed object, `RollOver` to the object now under the pointer | read (`player.rs`, re-read in task 22.1; code in the Player, `releaseOutside` event and `rollOver`) | none |
| `mouseOver` and `mouseOut` bubble, `rollOver` and `rollOut` do not (chain up to the common ancestor); drag-out and drag-over dispatch like roll events | read (`interactive.rs`, `player.rs`, task 22.1) | O9 closed |
| Hover events before `mouseMove` (task and design) against Ruffle's `mouseMove` first | read; our order differs on purpose (task text) | owner to decide |
| Only the current state is parented; the hit state has no node; a button state child takes no Default_Instance_Name | ours-only (FakeBackend, `test/unit/buttonNodes.test.ts`) | none |
| A clip inside a button state does not advance | ours-only | none |
| Ruffle ran `spacer` after a click on the player; `entity_game` loaded and did not advance; Input_Script not replayed | measured | O9 |
| Runtime Named_Limits reach reports only from the Node replay (and the `spacer` Play_Test run) | ours-only | O28 |
| `spacer` Overall_Match 100 does not see dynamic text; Infobar digits missing in the screenshot | ours-only | O29, O30 |

Measured in task 30: only the packaged override, by running `test/unit/emit.test.ts` (24 tests pass, including the
recursive override walk and the planned replacement of `a.b.Cls`). Nothing was run against Ruffle in task 30.

## Point (robustness task 15.1)
- **`flash.geom.Point` formulas.** Evidence: read in Ruffle `core/src/avm2/globals/flash/geom/Point.as` at `4a8d396`
  by the robustness design (section "Point"); not re-read in task 15.1 (`.work/ruffle-src` is empty). Not measured
  against Flash. Code: `template/shim/Point.ts`.
  - `length` = `sqrt(x*x + y*y)`; `toString()` = `(x=1, y=2)`; `equals` is `==` on both fields.
  - `normalize(t)`: when `length > 0`, scale by `t / length`; a point of length 0 is unchanged.
  - `distance(a, b)` = `b.subtract(a).length`.
  - `interpolate(a, b, f)` = `(b.x - (b.x - a.x) * f, b.y - (b.y - a.y) * f)`, so `f = 1` gives `a` and `f = 0` gives `b`.
  - `polar(len, angle)` = `(len * cos(angle), len * sin(angle))`.
  - `offset`, `copyFrom`, `setTo` assign in place.
