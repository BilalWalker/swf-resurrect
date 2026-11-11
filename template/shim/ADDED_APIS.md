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
| `getChildAt` | `MainTimeline.as:36` |
| `Shape` | `MainTimeline.as:51` |

Only `EXIT_FRAME` is dispatched, once per tick, by the EXIT_FRAME pass (task 4, not added yet). The other new `Event` constants are accepted by `addEventListener` and never dispatched.
