# Checkpoint 4 review

Branch `wip/as3-coverage`. Range `bd17350..HEAD` at `f12918c` (a1cd7e1, d454386, f12918c).

## (a) fidelity-reviewer report summary

Verdict: holds with findings.

- `typecheck`, `typecheck:template` and the web typecheck are clean.
- 8 targeted files, 28 tests pass: overallMatch.e2e, staticText.e2e, convertStaticEditText, staticTextBounds.property, rotatedSize, rotatedBounds.property, spacerPlay (Node and Chromium).
- No change to floors, tolerance, pixelDiff, Reference_Frames, goldens, timeouts or PIPELINE_SLOTS. `overallMatch.e2e` only gained assertions (no `text` kind; exactly 13 `text-metrics` for spacer). Nothing in `web/` or `mcp/`. No `.work/` file is tracked.
- Scores:
  - spacer 100.00 / nc / 0 (13 text-metrics, 7 stroke-style, 1 filter, no `text` entry).
  - click_block 95.75 / 100 / 0, unchanged. Its one DefineEditTextTag (id 10) is wasStatic and readOnly, so it is now drawn as static text. The gap is the dropped morph shape at depth 7, a named cause. The reviewer did not attribute the large region x419-533 y282-382 itself.
  - static_text 100 / nc / 0, unchanged.
- Static edit text routing is correct and tested.
- Screenshots: "Press Enter to begin", the Infobar digits "× 060", the red "?" "× 001", hearts and "Pause" are drawn. HUD digits match Ruffle's `c29-ruffle-2.png` by eye. Start and Pause texts cannot be compared with Ruffle (not in that image).

Findings:
1. Stale steering note on container `width`/`height` setters.
2. `tasks.md` and `tasks.meta.json` uncommitted.
3. The after-task hook flags only f054a04's 73-character subject (pre-existing, not amendable).
4. Task 33.1 mark pending.

Not verified by the reviewer: the full suite, other samples, the setter maths at 90 and 180 degrees (Open_Item O24), the text-metrics claim.

## (b) Responses

1. Fixed in commit 7715fba: `flash-behaviour.md` note and register row for O24, the O24 row in `design.md` Open_Items, and a register row for static edit text drawn as shapes.
2. and 4. Committed with this file.
3. Left as is. The commit is already on the branch and may not be amended.
- The setter maths at 90/180 degrees stays open under O24. It is neither read in Ruffle nor measured against Flash.
- The click_block region x419-533 y282-382 is not attributed. The known cause is the dropped morph shape at depth 7.

## (c) Implementer measurements

- Full suite: 1849 tests passed. One `render.e2e` afterAll timeout under load; it passes alone.
- spacer Overall_Match before Block D: 100/100 (frames 1 and 2). After: 100/100. No regions were removed in the frame comparison because the reference frames do not show script-added texts.
- Visible effect in `.work/spacer-start.png`, `.work/spacer-hud.png`, `.work/spacer-pause.png` (not committed).
- New Named_Limits in Block D: none. `text-metrics` is the standing limit.
