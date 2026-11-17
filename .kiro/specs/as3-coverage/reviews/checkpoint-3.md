# Checkpoint 3: `spacer` plays

Branch `wip/as3-coverage`. Review base `7a1cd2e`, reviewed head `f054a04` (27 commits). Block C is complete with the games playing. The owner decides Block D from the meter.

## (a) Fidelity-reviewer report

Verdict: **holds with findings** at `f054a04`.

- `typecheck`, `typecheck:template`, `typecheck:web` clean.
- Full suite: 259 files, 1838 tests, 258 passed, 1 failed (`render.e2e` afterAll hook, 30 s `launched.stop()` timeout under load; passes alone 14/14 in 5 s). Wall clock 201 s.
- Floors and tolerance unchanged except the new spacer floor 100 (frames 1 and 2 compared). `pixelDiff.ts` untouched. `PIPELINE_SLOTS` 3. No timeout raised. The only golden change is `test/fixtures/clickgoto/expected-scene.json` (formatVersion 3 and scenes).
- All 11 samples re-measured and equal to the claim (Overall_Match / Trace_Score / problems):

| Sample | Overall_Match | Trace_Score | Problems |
|---|---|---|---|
| clickgoto | 100 | 100 | 0 |
| tweendemo | 100 | not compared | 0 |
| radial | 100 | not compared | 0 |
| gradients | 99.41 | not compared | 0 |
| acid-color-2 | 100 | not compared | 0 |
| mask_reapply | 99.99 | 100 | 2 |
| click_block | 95.75 | 100 | 0 |
| 3_joystick | 98.86 | 75 | 0 |
| slider_component | 99.93 | 25 | 182 (7 omitted classes, named) |
| entity_game | 100 | not compared | 0 |
| spacer | 100 | not compared | 0 |

- Spacer plays: the Node and Chromium spacer Play_Tests passed (72 s). Evidence per rule: Enter starts the level (strong); each movement key (strong); player stays in bounds (WEAK: it checked the borders, not the half-size inset, and removing the inset passed); shooting (strong); a hit Fly runs its death to the last frame and is removed (strong; identity by instance name; only `collisionFlyBullet` leads to `die`); pause and resume (strong); no error in 30 s (strong).
- Mutants run by the reviewer: remove `die()` in `collisionFlyBullet` fails; Fly ignores `isPaused` fails; `spawnBullet` returns early fails; no `counterEnemySpawn.stop()` on pause fails; remove the scene-bound clamp fails; remove the half-width inset PASSED (the weak one).
- Licence and provenance: `handwritten/spacer` files and headers, LICENSE byte-identical to `samples/LICENSES/GPL-3.0.txt`, README line, `SET.json` exactly `KeyObject` and `PhysicEngine` with GPL-3.0, PROVENANCE files. No spacer SWF, output, Ruffle output or reference frame is tracked. Upstream facts confirmed with `gh`: Zabuzard/Spacer GPL-3.0 master `52ebaf94`, tag v1 = `2c7326cd`, `Spacer.swf` 85334 bytes SHA-256 `368926f9...52a50a` equal to the local file, LICENSE blob `9cecc1d4` with only the FSF header line; iainlobb/EntityAsteroids MIT master `4e449001`, SWF 12607 bytes (the start of its hash was lost in console noise, so it was not compared end to end).
- The spacer reports list exactly the two hand-written classes, with reason, licence and `replacesTranslated`. The 15 `namedLimit` ids in `template/` are all documented in `ADDED_APIS.md`. Spacer and entity_game reports list the five replay-time ids; `collision-coverage-mask` and `stage-scaleMode` (raised only in play) are absent from the spacer `behaviour.namedLimits` (O28).
- Findings: (1) commit `f054a04` subject is 73 characters (limit 72), cannot be amended; (2) `render.e2e` afterAll flake under load; (3) weak bounds assertion; (4) spacer Overall_Match 100 compares only frame 1 of each scene (start and title screens), a thin floor, honestly reported; (5) O28 report gap; (6) slider_component 7 omitted classes unchanged; (7) tasks.md and tasks.meta.json uncommitted.
- Not verified by the reviewer: the floor tests on their own (they ran inside the suite), Ruffle behaviours (no source), the Chromium screenshot and Block A pixel counts, the end of the entity_game SWF hash.

## (b) Responses

1. Subject of `f054a04` is 73 characters. Accepted. It cannot be amended and the owner regroups commits.
2. `render.e2e` afterAll flake. Same class of load flake seen earlier; passes alone; no timeout raised; recorded.
3. Weak bounds assertion. Fixed in `a5c9b24` (Test). The Play_Test now holds ArrowLeft and ArrowUp and requires the stop to be 37.4 (+- 3) from the left and top borders, which is half the Player content box (width and height as the game reads them) measured at the top-left stop. The inspection hook has no width, so the half size is a measured constant with a tolerance for rotation. Mutation check in a scratch copy `.work/mut-bounds` (shared run output, `PhysicEngine.ts` with `minX = scene.getLeftBound()` and no `width/2`): the Node Play_Test FAILS ("the player did not stop half its size inside the borders", insetX 0, insetY 37.07). The unmutated project passes in the Node layer (1 run) and the Chromium layer (65 s). The Chromium layer was not run against the mutant (the test has no directory override).
4. Spacer Overall_Match 100 compares only frame 1 of each scene. The floor cannot see the play screen. The Play_Test is the evidence of play. The only FFDec reference frames of the root timeline are frames 1 and 2.
5. O28 stays OPEN; not done. The spacer reference has `input.json` and `test.toml` (`num_frames = 300`) but no `output.txt`, so `runBehaviour` returns `not-compared / no-reference-trace` before any Replay. Running the Replay there is possible but it would change the early-return structure of `runBehaviour` and the not-compared paths, and it would not close the gap: 300 ticks end before the first Fly (about tick 600) and the hit (tick 843 in the Play_Test), so `collision-coverage-mask` would still be missing; only `stage-scaleMode` would appear. Judged not small and not sufficient. The spacer Play_Test already checks the three ids a 30 s play raises (`SPACER_EXPECTED_NAMED_LIMITS`). Trace_Score semantics, floors and not-compared reasons are untouched.
6. slider_component 7 omitted classes. Unchanged from earlier checkpoints (`fl.*` components, out of scope).
7. tasks.md and tasks.meta.json uncommitted. Committed with this file.

## (c) Measurements by the implementer

Suite wall clock (`npm test -- --run`):
- Step 1: 236.4 s with 3 failures, fixed by `3a48ccb` and `023ffe1`. Then 232.4 s and 238.9 s.
- Commit `6201ae1` saved 17 s of the spacer Chromium test (128 to 111 s). Commit `f054a04` (render every 60 steps) saved no measurable time.
- After `f054a04`: 200 s, 190 s, 202 s (with load timeouts). Reviewer: 201 s. The owner measured 131 s at Checkpoint 2. Our runs vary from 141 to 239 s with machine load.
- Slowest files: `pipeline.e2e` 188 to 226 s; `entityPlay.chromium` up to 146 s under load (8.8 s alone); `determinism.e2e` 146 to 195 s (its own work about 37 s, the rest waiting for slots); `typeCheckGate` 114 to 152 s; `spacerPlay.chromium` 110 s (65 s alone); `web/server.e2e` 107 to 148 s.
- Recommendations not applied: relax the per-sample npm `tsc` and `vite` in `pipeline.e2e` (it proves that TS 7 agrees with the gate's TS 6 and the build of the fresh run); split the slow `typeCheckGate` tests; profile the 1800 `evaluate` round trips of the Chromium Play_Tests and batch several steps per call where assertions allow; merge `determinism` run B into `pipeline.e2e` run A. `PIPELINE_SLOTS` stays 3. `render.e2e` afterAll `launched.stop()` 30 s timeout is a flake under load.

The 11-sample table is in section (a) (re-measured by the reviewer, equal to the implementer's claim).

New Named_Limits since `7a1cd2e`: `getBounds-content-ignored`, `collision-coverage-mask`.

Open_Items: `design.md` O1 to O32 (32).

Block C is complete with the games playing (`entity_game` and `spacer` Play_Tests pass in the Node and Chromium layers). The owner decides Block D from the meter.

## Task status marks

Tasks 30 `[x]`, 31 `[x]`, 32 `[x]` in `tasks.md`; `tasks.meta.json` carries the execution records. Nothing else in the spec is pending for Block C.

## git status

Taken after staging, just before the commit of this file:

```text
On branch wip/as3-coverage
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	new file:   .kiro/specs/as3-coverage/reviews/checkpoint-3.md
	modified:   .kiro/specs/as3-coverage/tasks.md
	modified:   .kiro/specs/as3-coverage/tasks.meta.json
```
