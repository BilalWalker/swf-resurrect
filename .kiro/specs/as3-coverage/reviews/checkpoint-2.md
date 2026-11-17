# Checkpoint 2 review (as3-coverage, branch wip/as3-coverage)

## Fidelity-reviewer report

Verdict: **holds with findings**, at commit 12557c4.

- `typecheck`, `typecheck:template`, `typecheck:web`: clean.
- Full suite: 236 files, 1732 tests, 0 failed, 141 s (131 s main phase + 8 s second phase).
- Floors, tolerance, reference files and goldens are unchanged, except the new entity_game floor 100 (plus a check that the report lists `code-drawn-shapes` and has one frame). No timeout was raised. `limits.ts` gained only the `code-drawn-shapes` kind.
- All 10 samples were re-measured and equal the claim (table below).
- Play_Tests pass: Node 200 ms, Chromium 4.4 s.
- Evidence strength: start click strong; direction key moderate to strong (ship found by index among Sprite children, no negative control); fire key moderate to strong (any new sprite near the ship would satisfy it); bullet hit moderate and weakest (count-based, never identifies a rock, relies on seeded `Math.random`); 30 s without error strong.
- entity_game's fidelity report lists the known visual limit `code-drawn-shapes`. `behaviour.namedLimits` lists exactly `device-font-metrics`, `filter-not-drawn:GlowFilter`, `graphics-stroke-not-hit`, `mouse-wheel-not-dispatched`, `useWeakReference-ignored`; clickgoto lists none. All 13 namedLimit ids in `template/` are in ADDED_APIS.md.
- `SET.json` is `[]`; no SWF was added except entity_game; nothing under `web/` or `mcp/` changed; nothing from `.work/` is tracked; no Asteroids/Breakout in folder names or UI strings (only the licence file name `samples/LICENSES/MIT-EntityAsteroids.txt`).
- Signal, SignalBinding, SignalBindingList (and ISignal, ISignalBinding) are translated, not overridden, with no type errors. Signal and ISignal are "loose" (`any[]` rest parameters, `* as any`, `valueClasses[...]` left as index syntax).

Findings:
1. The hit assertion is count-based, not identity-based.
2. The `useWeakReference-ignored` detail is only the event type.
3. Commit 12557c4 merged four e2e files and "every assertion kept" was not diffed by the reviewer.
4. The tasks.md / tasks.meta.json edits were uncommitted (expected).

Not verified by the reviewer: diff of old and merged e2e files, mutation check, commit-hygiene hook, Play_Test assumptions (bullet speed 10, lifetime 25 ticks, 900x700 wrap).

## Responses

**Finding 1 (hit assertion).** Mutation check done, commit 21b5a53. In a scratch copy of the emitted entity_game (`.work/mutation-entity/`, not committed) `Body.testCollision` was changed to `return false`. The old assertion did NOT fail: it passed with `firstHit = {age: 1, removed: 2, added: 2}`, because the bullet follower lost the bullet on its first tick and two unrelated sprites near the predicted point matched the count rule. The scenario now follows the bullet by its sprite name (stable across ticks) and counts a hit only when the bullet sprite is gone and the nearest rock (neither bullet nor ship) was destroyed (name gone) or split (a sprite with a new name appears on it within two ticks). Result: the mutant now fails with "no bullet overlapped a rock within the bursts tried" (36 bullets, 864 ticks); the real project passes in the Node and Chromium layers; `tsc --noEmit` is clean. One bullet loss in the real run (age 4, rock instance44) is no longer counted as a hit because the rock neither disappeared nor split; its cause was not investigated.

**Finding 2 (useWeakReference detail).** Fixed in commit 6867c78 (area Shim). The detail now reads `addEventListener('<type>') useWeakReference is ignored: listeners are held strongly`. The id is unchanged, so entity_game keeps its five ids. ADDED_APIS.md row and `eventPriority.test.ts` updated; `typecheck:template`, the unit test and the two score-floor tests pass.

**Finding 3 (merge of four e2e files).** Diffed `12557c4^:test/e2e/{graphics,textField,stageChildAndKeys,keyboardIframe}.e2e.test.ts` against `generatedProject.e2e.test.ts`. There are 24 `expect(` calls before and 24 after. Fifteen are identical text. Nine pixel checks in the graphics case changed only in form: `is(px(x, y), c)` became `near(img.px(x, y), c)`; the tolerance is the same (each channel within 8) and the coordinates and colours are the same. The four tests are now four cases of one project, selected by `?case=`. Fixed sleeps were replaced by a class-ran flag plus two animation frames, and by waiting for the click counter (stated in the commit message). Not checked here: whether the old sleeps hid a timing difference.

**Finding 4.** Committed with this file.

### Open items of Block B

- Dictionary key text semantics (string key vs number key of the same text) not measured.
- `for-in` / `for each` over a Dictionary is not translated.
- `beginFill` alpha and multi-subpath fills are now Named_Limits.
- Graphics fill hit uses even-odd (Flash uses nonzero); not measured.
- Strokes are not hit (Named_Limit `graphics-stroke-not-hit`).
- `is` against a Class works only for a local variable (`isInstanceOf`); `x as T` is still a plain cast.
- No Ruffle reference for entity_game: installed Ruffle web player 0.7.1 loaded the game but did not advance under headless input; no tick-exact input injection; two attempts.
- Ruffle key format (`Char`/`ArrowUp`) taken from the spec text, not re-read (`.work/ruffle-src` is empty).
- O4, the AVM2 `this` scope rule, not measured.
- Web UI `iframe.focus()` belongs to the web owner.
- Key delivery with no click and the Stage child page were measured in a generated project, not on the built entity_game page.
- Runtime Named_Limits reach the Fidelity_Report only from the Node replay, not from the Chromium render.
- Timer is not yet in the Shim (`inspect.timers()` is `[]`).

## Measurements by the implementer

Suite runs (`npm test -- --run`):

| Run | Time |
|---|---|
| Cold | 238 s, 3 failures fixed by db0ccab and 0325e32 |
| Second | 198 s |
| Third | 166 s |
| After merge commit 12557c4: baseline | 160.5 s |
| After merge commit 12557c4: next | 148 s |
| After merge commit 12557c4: next | 188 s |
| Reviewer | 141 s |

Slowest files: `pipeline.e2e` 85 to 151 s; `determinism.e2e` 95 to 115 s; `entityPlay.chromium` 69 to 118 s under load; `server.e2e` 66 to 71 s; `spacerLoad` 28 to 41 s.

Recommendations not applied:
- `determinism.e2e`: compare against the shared run instead of making its own.
- `spacerLoad`: use the run cache.
- `PIPELINE_SLOTS` 4 is risky.
- `render.e2e` `afterAll` 30 s `launched.stop()` flake under load.

Checkpoint 2 sample table (Overall_Match / Trace_Score / type errors):

| Sample | Overall_Match | Trace_Score | Errors |
|---|---|---|---|
| clickgoto | 100 | 100 | 0 |
| tweendemo | 100 | nc (no-reference-trace) | 0 |
| radial | 100 | nc (empty-reference-trace) | 0 |
| gradients | 99.41 | nc | 0 |
| acid-color-2 | 100 | nc | 0 |
| mask_reapply | 99.99 | 100 | 2 |
| click_block | 95.75 | 100 | 0 |
| 3_joystick | 98.86 | 75 | 0 |
| slider_component | 99.93 | 25 | 186 |
| entity_game | 100 | nc (empty-reference-trace) | 0 |

Commits of this step: 6867c78 (Shim, finding 2), 21b5a53 (Test, finding 1). Final `git status` is in the commit message of the Spec commit and in the reply.
