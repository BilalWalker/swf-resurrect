# Provenance: clickgoto

| Field         | Value |
|---------------|-------|
| Author        | Ruffle contributors |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/6cc7a26a97b3ee7652f2d82653d88f36031e713a/tests/tests/swfs/avm2/movieclip_displayevents_clickgoto |
| Licence       | MIT OR Apache-2.0 |
| Modifications | None. `test.swf` is byte-identical to the upstream file. |
| SHA-256       | `fe3c807b0be4f884d628c4ab2ac84ad6bcc4774111f36d1570b7c59ff53a7d6d` |

Ruffle is dual-licensed under MIT and Apache-2.0 (see `LICENSE.md` in the
Ruffle repository). This file is one of Ruffle's own AVM2 regression tests,
authored in Adobe Animate.

## Licence chosen

Licence chosen: MIT, from the option `MIT OR Apache-2.0`. The licence text
is in `samples/LICENSES/MIT-Ruffle.txt`.

## Files

- `test.swf`: the pipeline input. The only file the pipeline may read.
- `original-source/*.as`: the upstream ActionScript 3 sources, kept for
  human reference when checking a translation. The pipeline must never
  read them; it works from the SWF alone.

## What the SWF contains

- ActionScript 3, SWF version 43, stage 550 x 400 px, 24 fps, white
  background, root timeline of 3 frames.
- Four shapes (character ids 1, 2, 4, 5): coloured rectangles.
- Two sprites with two frames each:
  - id 6, linked to class `LeftButton`, placed on the root as `l_button`
    at (143.5, 270) px, depth 1. Frame 1 shows shape 4, frame 2 shape 5.
  - id 3, linked to class `RightButton`, placed on the root as `r_button`
    at (415, 272.5) px, depth 3. Frame 1 shows shape 1, frame 2 shape 2.
- Root is linked to class `MainTimeline`.
- No tweens, text, sound, filters or masks.

## Expected behaviour

Both button constructors register a click listener and call `stop()`, so
each button rests on frame 1 at start.

| Action              | `l_button`                          | `r_button`                          |
|---------------------|-------------------------------------|-------------------------------------|
| Start               | stopped, frame 1                    | stopped, frame 1                    |
| Click `l_button`    | `gotoAndStop(2)`: stopped, frame 2  | `gotoAndStop(1)`: stopped, frame 1  |
| Click `r_button`    | `gotoAndPlay(2)`: playing from 2    | `gotoAndPlay(1)`: playing from 1    |

While playing, a button loops over its two frames, so its colour
alternates every frame.

## Known limits as a sample

- `MainTimeline` and `EventWatcher` are test instrumentation: they trace
  display-list events and stop everything after 30 frames. The vertical
  slice translates only the two button classes.
- There is no motion tween. A sample with real timeline motion is still
  needed for later specs.

## Reference behaviour (`reference/`)

Copied unedited from the same Ruffle test directory at the same commit,
same licence (MIT OR Apache-2.0):

- `reference/output.txt`: the expected `trace()` log of the SWF. Ruffle's
  test suite asserts its own output equals this file, so it is the
  behaviour a correct player must produce.
- `reference/input.json`: the input the log was recorded with. One entry
  per frame step: `Wait`, or a `MouseDown` / `MouseUp` at a stage
  position in pixels.
- `reference/test.toml`: `num_frames = 32`, the number of frames the test
  runs.

Our output is not expected to match this log line for line yet: the Shim
does not dispatch `added`, `addedToStage` or `frameConstructed`, names the
root `""` instead of `root1`, and prints events as `[object Object]`.
