# Added Shim APIs

APIs added to the Shim beyond the vertical-slice surface. Each row cites a line in the fixture classes under `test/fixtures/clickgoto/scripts/` that uses it.

| API | Needed by |
| --- | --- |
| `Event.EXIT_FRAME` | `EventWatcher.as:23`, `MainTimeline.as:23` |
| `Event.ADDED` | `EventWatcher.as:24` |
| `Event.ADDED_TO_STAGE` | `EventWatcher.as:25` |
| `Event.FRAME_CONSTRUCTED` | `EventWatcher.as:26` |
| `Event.REMOVED` | `EventWatcher.as:27` |
| `Event.REMOVED_FROM_STAGE` | `EventWatcher.as:28` |
| `Event.RENDER` | `EventWatcher.as:29` |
| `trace` | `EventWatcher.as:17` |
| `setTraceSink` | Supports `trace`: lets tests and hosts replace the output of the `trace` calls at `EventWatcher.as:17` |
| `_exitFrame` | Supports `Event.EXIT_FRAME`: the runtime's EXIT_FRAME pass dispatches it, so the listener added at `EventWatcher.as:23` fires once per clip per tick |
| `getChildAt` | `MainTimeline.as:36` |
| `Shape` | `MainTimeline.as:51` |
| `Event.bubbles` | `EventWatcher.as:17` (`Event.toString` prints it into the trace text) |
| `Event.cancelable` | `EventWatcher.as:17` (`Event.toString` prints it into the trace text) |
| `Event.eventPhase` | `EventWatcher.as:17` (`Event.toString` prints it into the trace text) |
| `Event.toString` | `EventWatcher.as:17` (concatenating `event` into the trace text calls it) |
| `DisplayObject.dispatchEvent` (bubbling) | `EventWatcher.as:24`, `:27` (the root's listeners must hear a child's `added`/`removed` at `eventPhase` 3, with `target` still the child); `EventWatcher.as:17` prints the phase (`reference/output.txt:174-175`) |
| `_isStageRoot` | `EventWatcher.as:25`: the Player marks the root so `addedToStage` is dispatched only for objects whose parent chain ends there |
| `_onStage` | Supports `_isStageRoot`: walks the parent chain; gates `addedToStage` (`EventWatcher.as:25`) and `removedFromStage` (`EventWatcher.as:28`) |
| `added` / `removed` dispatch (`announceAdded`, `announceRemoved`) | `EventWatcher.as:24`, `:27`: `addChild`, `removeChild` and timeline child changes dispatch them on the child, bubbling |
| `_deliver` | Supports bubbling `dispatchEvent`: runs the listeners of one object for one phase |
| `_flushAdds` | Supports `Event.ADDED` (`EventWatcher.as:24`): adds from backward timeline moves are announced in phase C, before `frameConstructed` |
| `frameConstructed` phase | `EventWatcher.as:26`: dispatched in phase C of each tick and after the initial build, children first, at the target only |
| `ConstructionContext.cycle` / `ClipCycle` | `LeftButton.as:21` (`this.gotoAndStop(2)`), `:23` (`this.parent.r_button.gotoAndStop(1)`): a script goto outside the frame step runs one Goto_Extra_Cycle when it returns; clips built without a Player have no cycle |
| `internal.frameConstructed` | Supports `ClipCycle`: the cycle's `frameConstructed` pass, children first (`LeftButton.as:21`, `:23`) |

`EXIT_FRAME` is dispatched once per clip per tick by the EXIT_FRAME pass after `root._step()`. `ADDED`, `REMOVED`, `ADDED_TO_STAGE`, `REMOVED_FROM_STAGE` and `FRAME_CONSTRUCTED` are dispatched as in the rows above. `RENDER` is accepted by `addEventListener` and never dispatched.

Note: `gotoAndStop` / `gotoAndPlay` called outside the frame step (a click handler, or user code between `update()` calls) now runs an extra cycle when the call returns: `frameConstructed` children first, the queued frame script (only if the frame changed), then `exitFrame` children first. No `enterFrame` and no clip advances. A goto inside a frame step, the initial build or another cycle starts no cycle.
| `MouseEvent.MOUSE_DOWN` | `Interactivity3.as:37`, `BaseButton.as:127`, `:134`, `Slider.as:326`, `:334` (breadth fixtures) |
| `MouseEvent.MOUSE_UP` | `Interactivity3.as:38`, `BaseButton.as:128`, `:139`, `Slider.as:327`, `:335` |
| `MouseEvent.MOUSE_MOVE` | `Slider.as:388` |
| `mouseDown`, `mouseUp`, `mouseMove` bubble by default | Same lines as the three constants: a listener on a parent hears a child's pointer event, like `click` |
| `DisplayObject.mouseX`, `mouseY` (local pointer position through the parent chain; 0 when a scale is 0) | `Interactivity3.as:62`, `:68`; `Slider.as:318`, `:342`; `MainTimeline.as:42` (`click_block`) |
| `internal.setPointerPosition`, `internal.globalToLocal` | Support for `mouseX` / `mouseY` (same lines) |
| `Stage` (class with `addEventListener`, `removeEventListener`, `hasEventListener`, `dispatchEvent` only) | `Interactivity3.as:39` (decompiled copy line 38), `MainTimeline.as:47` |
| `DisplayObject.stage` | `Interactivity3.as:39` (bare `stage` in the root constructor), `MainTimeline.as:47` (`click_mc.stage`) |
| `ConstructionContext.rootParent`, `internal.attachRoot` | Support `DisplayObject.stage` inside the root constructor (`Interactivity3.as:39`) |
| `ClipHooks.constructFrameOne`, `ConstructionContext.named` / `instance`, `internal.takeConstructionContext` / `setContextForConstructor` / `buildFrameOne`, `Sprite._ctx` / `_buildFrameOne` / `_advance` / `_enqueueFrameScript` and the timeline child helpers moved from `MovieClip` to `Sprite` | Construction_Bind (internal API, not public): `Interactivity3.as:34` reads `joystick.x` in the constructor body, so the frame-1 children are bound in the `Sprite` constructor (inherited by `MovieClip`; `mask_reapply`'s `Main` extends `Sprite`, fixture `test/fixtures/construction/Main.as:16`); `new Cls()` from script finds its symbol through the Player |
| `defineInterface` | `Button.as:9`, `LabelButton.as:16`, `Slider.as:17` (`implements IFocusManagerComponent`), `FocusManager.as:19` (`implements IFocusManager`); the interface files `IFocusManager.as`, `IFocusManagerComponent.as`, `IFocusManagerGroup.as` each export a token made with it |
| `declareImplements` | `Button.as:9`, `LabelButton.as:16`, `Slider.as:17`, `FocusManager.as:19`: registers the class after its declaration, so `UIComponent.as:102`, `FocusManager.as:69`, `:109` and `:224` (`x is I`, written `x instanceof I`) answer |
| `AS3InterfaceToken` (type) | Supports `defineInterface`: the type of the token exported by `IFocusManager.as`, `IFocusManagerComponent.as`, `IFocusManagerGroup.as` |
| `DisplayObject.toString`, `Stage.toString` (`[object ClassName]`), `internal.registerClassName`, `internal.classNameOf` | `MainTimeline.as:42` (`click_block`: `" target: " + e.target`; Reference_Trace `target: [object MovieClip] click_mc`); the Shim registers `DisplayObject`, `DisplayObjectContainer`, `Sprite`, `MovieClip`, `Shape` and `Stage`, the Player registers each `classRegistry` key |
| `DisplayObjectContainer.mouseEnabled` (boolean, default true) | `BaseButton.as:68` (`mouseEnabled = param1`, local copy of `slider_component`) |
| `DisplayObjectContainer.mouseChildren` (boolean, default true) | `BaseButton.as:47` (`mouseChildren = false`) |
| `Sprite.buttonMode` (boolean, default false, stored only) | `BaseButton.as:46` (`buttonMode = true`) |
| `Sprite.useHandCursor` (boolean, default true, stored only) | `BaseButton.as:48`, `Slider.as:393` (`track.useHandCursor = false`) |
| `Event.formatToString(className, ...properties)` (instance method, as in Ruffle's `Event.as`; `Event.toString` uses it) | `ComponentEvent.as:29`, `SliderEvent.as:55` (bare call in an instance `toString`) |
| `Event.clone(): Event` (instance method, as in Ruffle's `Event.as`: a new Event with the same type, bubbles and cancelable) | `ComponentEvent.as:32`, `SliderEvent.as:58` (`override clone(): Event`, local copy of `slider_component`) |
| `ClipHooks.entryUpdated` (optional hook, internal) | Supports the Player's clip groups for the Scene_JSON `clipDepth` need (breadth Requirement 12): it tells the runtime which display-list entry describes each timeline child. No AS3 fixture line uses it (design section 11) |
| `internal.takeInstanceNumber`, `internal.resetInstanceCounter`, `internal.defaultInstanceName`, `internal.withoutDefaultName`, `internal.defaultNamesAreSuppressed` (Default_Instance_Name `instanceN`, one counter per movie) | `MainTimeline.as:42` (`click_block`: `" target: " + e.target`; Reference_Trace `target: [object MovieClip] instance2`) |
| `internal.setCaughtErrorSink`, `internal.reportCaughtError`, `EventDispatcher._describe`, `MovieClip._scriptOwner` | Support only, no AS3 fixture line: a listener or frame script that throws is reported as a Caught_Error with its site and the rest of the tick continues (Requirement 25.5) |
| `internal.clipsPreOrder`, `internal.clipsPostOrder` | Support `Event.EXIT_FRAME` and `frameConstructed` ordering (`EventWatcher.as:23`, `:26`): children run before their parent in the post-order passes |
| `Sprite._expose`, `Sprite._unexpose`, `TimelineChild` (type) | Support the Construction_Bind: they bind and unbind a timeline child to its instance name (`Interactivity3.as:34` reads `joystick.x` in the constructor body) |
| `Stage._isStage`, `Stage._parent`, `Stage._children`, `isStage`, `ParentNode` (type) | Support `Stage` and `DisplayObject.stage` (`Interactivity3.as:39`, `MainTimeline.as:47`): the Stage_Object is the root clip's parent |
| `getDefinitionByName` | Import-cycle cut (Requirement 37.3): a value use of a class that would close a cycle with its base class is read through the registry, e.g. `private var levelScene:* = LevelScene;` becomes `getDefinitionByName('LevelScene')`; Fixture_Class in `test/unit/importCutRewrite.test.ts` |
| `registerDefinitions` | Supports `getDefinitionByName`: `classes.ts` registers every emitted class before the Player is constructed |
| `ArgumentError`, `IllegalOperationError` (subclasses of `Error`, `name` equals the class name, constructor `(message = '', errorID = 0)`) | No sample line yet: `Signal.as` of `entity_game` (as3-coverage task 19, design D9) and `Stage.removeChild` of a non-child (task 9, Requirement 7.3) need them |
| `getQualifiedClassName(value)` (registered name of an instance or class object, JavaScript function name when unregistered) | No sample line yet: `Signal.as` of `entity_game` (task 19, design D9) |
| `getTimer()`, `setTimeSource` (internal, called by the Player constructor) | No sample line yet: Requirement 12.4, used by Timer work (design "Timer", task 19 onward) |
| `KeyboardEvent` (extends `Event`; `KEY_DOWN` `"keyDown"`, `KEY_UP` `"keyUp"`, numeric `keyCode`, bubbles by default), `Keyboard` (`UP` 38, `DOWN` 40, `LEFT` 37, `RIGHT` 39, `ENTER` 13, `ESCAPE` 27, `SPACE` 32, from the `flash.ui.Keyboard` documentation) | No sample line yet: the key handlers of `entity_game` and `spacer` (as3-coverage tasks 8 and 19, design D3). `test/unit/keyboardShim.test.ts` holds the Fixture_Class line `KeyboardEvent.KEY_DOWN` |
| `addEventListener(type, listener, useCapture = false, priority = 0, useWeakReference = false)`, `removeEventListener(type, listener, useCapture = false)` | No sample line yet: the five-argument calls of `spacer` and `entity_game` (design D5). Order: descending `priority`, insertion order inside one priority, a listener present at any priority is ignored |
| `internal.namedLimit`, `internal.takeNamedLimits` | Support only: the one sink for run-time Named_Limits (design "Data Models"). Once per id; the first detail is kept |
| Named_Limit `useCapture-ignored` | `addEventListener(..., true)`: the capture phase does not exist in the Shim, the listener runs in the target and bubble phases |
| Named_Limit `useWeakReference-ignored` | `addEventListener(..., false, 0, true)`: the listener is held strongly |
