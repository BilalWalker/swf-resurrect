# Checkpoint 1 review (as3-coverage, Block A)

## Fidelity-reviewer report

Compared with f1db0d0, the parent of spec commit 353958d.

**Checks that hold**
- `typecheck`, `typecheck:template` and `typecheck:web` all exit 0.
- `clickgotoReplay`, `overallMatch.e2e` and `traceScore.e2e` pass (3 files, 20 tests).
- No FLOOR, tolerance or timeout line was removed in `test/`, `src/`, `scripts/`, `package.json` or `vitest.config.ts`. `src/verify/core/pixelDiff.ts` is unchanged.
- No `samples/**` reference file changed. Only additions: `entity_game` PROVENANCE.md and `test.swf`, `spacer` PROVENANCE.md and `reference/test.toml`, and the GPL-3.0 and MIT licence files for the entity game.
- The 8 goldens `test/fixtures/{clickgoto,tweendemo}/translated/*.ts.txt` contain only `X -> X | null` in parameters and declared fields.
- `src/verify/core/report.ts` and `html.ts` changed only to add `typeCheckOptions` and one HTML sentence. Scoring is untouched.
- Scores measured by the reviewer (`pipeline --verify --force`), all equal to the claimed table (pixel / trace, nc = not compared):

| Sample | Pixel | Trace |
|---|---|---|
| clickgoto | 100 | 100 |
| tweendemo | 100 | nc |
| radial | 100 | nc |
| gradients | 99.41 | nc |
| acid-color-2 | 100 | nc |
| mask_reapply | 99.99 | 100 |
| click_block | 95.75 | 100 |
| 3_joystick | 98.86 | 75 |
| slider_component | 99.93 | 25 |
| entity_game | 100 | nc |

- `web/` and `mcp/` diffs against the base are empty. The only SWF added is `samples/entity_game/test.swf`. Nothing under `.work/` is tracked.
- No timeout was lowered. The diff adds new timeouts in new tests (the reviewer did not check whether an added `testTimeout` line sits in a pre-existing file).
- "Asteroids" and "Breakout" appear only in the file name `samples/LICENSES/MIT-EntityAsteroids.txt`, in `.kiro/specs/as3-coverage/*.md` and in `samples/entity_game/PROVENANCE.md`. They do not appear in `web/`, `src/` or `template/`.
- The strictNullChecks statement is present in `fidelity-report.json` and `translation-report.json` (4 samples read) and in the `fidelity-report.html` of all 10.
- `spacerLoad.e2e` passes in about 20 s. Spacer pipeline: 24 classes (11 clean, 5 loose, 8 unsupported), 77 type errors in Bullet, Fly, FlyBoss, Heart, KeyObject, LevelScene, Main, PhysicEngine, Player. First remaining errors in `Bullet.ts` (also Fly, FlyBoss): TS2415 (class incorrectly extends Sprite because of a private `levelScene` declared separately in the subclass), TS17009 (`super` must be called before `this`, line 19), TS2304 (`currentLabel` not found).

**Findings**
1. Trace gaps are not tied to a cause. For 3_joystick (75) and slider_component (25), `knownBehaviourGaps` is empty. Causes appear only as unsupported features and omitted classes (3_joystick: `wrap` missing, `with` unsupported in `code.Interactivity3`; slider_component: 3 changeHandler lines missing, fl.* UIComponent classes omitted).
2. Spacer fetch path: the reviewer says the spacer test passes without a SWF in `.work/samples/spacer/` and that the SWF was only at `.work/games-local/spacer.swf`. It did not run `npm run fetch:spacer`.
3. Two samples have type errors: mask_reapply 2 (TS2339, `mask` not on DisplayObject, `Main.class.ts`); entity_game 18 across Asteroid, AsteroidsGame, Bullet, EnemyShip, Ship, Gamepad, Signal. They are reported, not hidden. The spec text may not mention them.

**Not verified by the reviewer:** the full suite, whether the spec mentions finding 3, commit hygiene, and author-marked unverified claims.

## Responses

- **Finding 1:** Pre-existing behaviour of samples from earlier specs, with floors unchanged. Linking trace gaps to causes is a Verify feature outside Block A. Recorded as an Open_Item, no change.
- **Finding 2: disproved.** `.work/samples/spacer/test.swf` exists with SHA-256 `368926f94eb4de93918df9d06655ea2a4dd0ff28a06df725e61751c92552a50a`, the expected hash (checked by the orchestrator with `Get-FileHash`). `test/support/fetchedSpacer.ts` keys the skip on that target path, so the spacer tests ran against the fetched file.
- **Finding 3:** entity_game type errors were 40 before and are 18 now. mask_reapply had 2 before and has 2 now. The remaining entity_game errors belong to Block B (Vector conversion, `is Array`, `delete`, Signal, Stage/Keyboard members) and are expected to reach zero at Checkpoint 2. The 77 spacer errors belong to Block C (`this` in super args, `currentLabel`, the private `levelScene` redeclaration TS2415).

Additional records:
1. `Stage.focus` is typed `object | null` and causes TS2322 at `FocusManager.ts` line 495 in slider_component (gate TS2740 mapped to TS2322 in the e2e comparison, commit 49a3a54). Open item for the owner: design decision on the type of `Stage.focus`.
2. The subjects of afc33a6 and c5db71b are 74 characters, over the 72 limit. They cannot be amended, so this is fixed forward.
3. Web Open_Item for the web owner: the parent page should call `iframe.focus()` on load in `web/client/src/result.ts`.
4. The `publicHost.e2e` rate-limit flake did not recur in four full runs (web owner's item).
5. The first full run found three real Block A regressions: stale addedApis rows and shimMembers list, a TS2740/TS2322 gate mismatch, and a keyMap property bug with `Object.prototype` names such as "constructor". They were fixed forward in 7d9c0c0, 49a3a54 and a989d17.

## Measurements by the implementer

Four full-suite runs (`npm test -- --run`):

| Run | Time | Result |
|---|---|---|
| 1 | 122 s | 3 failed |
| 2 | 229 s | 2 failed |
| 3 | 106 s | 1 failed |
| 4 | 119 s | 209 files, 1608 tests, all green |

Warm_Suite_Time: 119 s. Fixes: 7d9c0c0, 49a3a54, a989d17.
