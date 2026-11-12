# Provenance: tweendemo

| Field         | Value |
|---------------|-------|
| Author        | Ruffle contributors (base file); SWF Resurrect project (added timeline) |
| Source URL    | https://github.com/ruffle-rs/ruffle/tree/6cc7a26a97b3ee7652f2d82653d88f36031e713a/tests/tests/swfs/avm2/movieclip_displayevents_clickgoto |
| Licence       | MIT OR Apache-2.0 |
| Modifications | Derived from `samples/clickgoto/test.swf`. `build.py` adds a 48-frame motion tween, three frame labels and a RemoveObject to the root timeline. Shapes, sprites and ActionScript are unchanged. |
| SHA-256       | `500314ba62ce40f7fb117ac0ad5bd03362bbf422a8ae4c501e1bb5682b4fdfa9` |

The base file is one of Ruffle's AVM2 regression tests, dual-licensed MIT
and Apache-2.0. Both licences permit modification. This derived file is
offered under the same terms.

## Licence chosen

Licence chosen: MIT, from the option `MIT OR Apache-2.0`. The licence text
is in `samples/LICENSES/MIT-Ruffle.txt`.

This file is derived by `samples/tweendemo/build.py` from
`samples/clickgoto/test.swf` and is offered under the same terms (MIT).

## Why it exists

`clickgoto` has no motion: every placement is a plain translation. This
sample exercises what a real Flash animation uses, so the converter and
runtime can be checked on it:

- matrix scale and rotation, changing every frame
- colour transform (alpha fade)
- `PlaceObject2` move records without a character id
- `FrameLabelTag`
- `RemoveObject2Tag`

It was not authored in Adobe Animate. It is a synthetic fixture built by
editing FFDec's XML dump and converting it back with `-xml2swf`, so it
proves the pipeline handles these tags, not that it handles everything an
authoring tool emits.

## How to rebuild

```
python samples/tweendemo/build.py
```

Needs Java and `tools/ffdec/ffdec-cli.jar` (FFDec 26.4.0). The build is
deterministic: the same inputs give the SHA-256 above.

## What the SWF contains

- Everything in `clickgoto`: stage 550 x 400 px, 24 fps, white background,
  buttons `l_button` and `r_button` with their click handlers.
- Root timeline of 48 frames (was 3).
- Shape 1 placed at depth 10 on frame 1 and updated on every frame up to
  frame 43:
  - position moves from (60, 90) to (490, 90) px along a shallow arc
  - scale grows from 0.6 to 1.4
  - rotation goes from 0 to 180 degrees
  - alpha multiplier falls from 256 (opaque) to 77 (about 30 %)
- Frame labels: `start` on frame 1, `middle` on frame 24, `gone` on
  frame 44.
- Frame 44 removes depth 10. Frames 44 to 48 show only the two buttons.
- The root timeline loops, so the tween restarts after frame 48.

## Matrix convention

FFDec writes `scaleX`, `scaleY`, `rotateSkew0`, `rotateSkew1` as plain
decimals. A point `(x, y)` maps to:

```
x' = scaleX * x + rotateSkew1 * y + translateX
y' = rotateSkew0 * x + scaleY * y + translateY
```

So in a six-number matrix `[a, b, c, d, tx, ty]`: `a = scaleX`,
`b = rotateSkew0`, `c = rotateSkew1`, `d = scaleY`.
