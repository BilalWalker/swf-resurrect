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
