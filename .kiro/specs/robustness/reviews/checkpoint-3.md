# Checkpoint 3 review (fidelity-reviewer)
Checkpoint 3 review (robustness Block C), wip/as3-coverage at 3610652
Verdict: holds with findings. Fixes for findings 4 and 5 follow in the Fixes section, finding 3 was fixed by the orchestrator. Findings 1 and 2 are owner decisions, open. Findings 6 and 7 are recorded only.

## Checks
- `npm run typecheck` and `npm run typecheck:template` are clean. Full suite (reviewer, one run): exit 0. Main phase 315 files passed, 1 skipped; 2243 tests passed, 7 skipped; vitest 178.1 s. Isolated phase 2 tests passed, 7.6 s. Warm_Suite_Time 188 s wall (target about 150 s).
- The helper's second run took 156.5 s. Its first run took 225 s and failed: a stale shimMembers expectation after SimpleButton and a repoHygiene load timeout, both fixed by 3610652. In that run the afterAll hooks of keyCodes.e2e (60 s) and render.e2e (30 s) also timed out under load and passed alone. launchChromium.e2e passed in both helper runs, so the Checkpoint 2 flake did not recur; it was not investigated.
- Targeted e2e, 9 files, 48 tests pass: entityPlay and spacerPlay (Node and Chromium), hostileFixtures, buttonFixture, overallMatch, clickgotoReplay, sampleOutcomes.
- Floors, tolerance, `pixelDiff.ts`, `samples/` and `test/fixtures/` are unchanged against main and 4de6805. Scene_JSON files in all 12 outputs are byte-identical to Checkpoint 2 (formatVersion 3 where there is no button). `web/` and `mcp/` unchanged.
- No redball4 file or class name is committed. Hygiene: no attribution lines, no forbidden paths.

Commits since the Checkpoint 2 review (4de6805): 1de379f Convert: button symbols and Scene_JSON 4 (Runtime, Steering); ca1667f Runtime: add button state model and SimpleButton (Shim); c9337f6 Runtime: hover and roll events and button state from the pointer (Shim); 9e24d07 Repo: ignore the Playwright MCP scratch folder; 4dc03b8 Test: button fixture end to end, Outcome count, floors (Verify, Pipeline) (73 characters, one over); 3610652 Test: list SimpleButton in the Shim class test, skip big files unread.

## Scores (all equal to Checkpoint 2 except slider_component type errors 182 to 177, because SimpleButton now exists in the Shim)
| Sample | Overall_Match | Trace_Score | Type errors | Outcome |
|---|---|---|---|---|
| clickgoto | 100 | 100 | 0 | converted, 4 of 4 |
| tweendemo | 100 | not compared | 0 | converted, 4 of 4 |
| radial | 100 | not compared | 0 | converted |
| gradients | 99.41 | not compared | 0 | converted |
| acid-color-2 | 100 | not compared | 0 | converted |
| mask_reapply | 99.99 | 100 | 2 | converted-with-gaps |
| click_block | 95.75 | 100 | 0 | converted-with-gaps (1 dropped placement) |
| 3_joystick | 98.86 | 75 | 0 | converted-with-gaps (`with` untranslated) |
| slider_component | 99.93 | 25 | 177 | converted-with-gaps, 20 of 27 |
| entity_game | 100 | not compared | 0 | converted, 23 of 23 |
| static_text | 100 | 0 | 0 | converted-with-gaps, 2 of 2 (`try` untranslated, one flash-api-gap StaticText) |
| spacer | 100 | not compared | 0 | converted, 24 of 24 |

Fidelity_report problems: 0 for all 12. No unnamed gap.

## Hostile fixtures (13 tests, same matrix as Checkpoint 2)
| Fixture | Result | Exit |
|---|---|---|
| empty file | refused not-swf | 3 |
| text file | refused not-swf | 3 |
| signature, no body | refused damaged | 3 |
| cut file | refused damaged | 3 |
| damaged CWS | refused damaged | 3 |
| AS1/AS2 | refused actionscript-1-2 | 3 |
| above lowered size limit | refused too-large | 3 |
| encrypted (decideOutcome only) | refused encrypted | 3 |
| time-limit (fake clock) | refused time-limit | 3 |
| FFDec exit at Unpack | refused damaged | 3 |
| TypeError at Unpack | failed internal-error | 1 |
| AS3 with no DoABC | converted, 0 candidates | 0 |
| 1 candidate, 0 translated | refused nothing-translated | 3 |

## redball4 (numbers only, default limits, no --verify)
- Outcome converted-with-gaps, exit 0. Helper run 123.4 s wall. Reviewer run 192 s wall (recover 40.9, unpack 68.0, convert 44.2, translate 8.5, emit 18.4, gate 0; sum 180 s; 64 percent of the 300 s limit). The stages were 1.6 to 1.8 times slower than at Checkpoint 2 (106.9 s). The machine looks slower or loaded; the cause was not found and this is not a regression.
- 56 candidates: 17 translated (3 clean, 14 loose), 20 omitted, 19 unparsed, 2 stub-dependent. 438 type errors (Checkpoint 2: 466). 120 dropped placements (Checkpoint 2: 162).
- `button` entries went from 78 to 0, with one `button-sound` entry. Scene_JSON is formatVersion 4 with 36 button symbols. The flash-api-gap kind is absent (5 at Checkpoint 2).
- Gap kinds: type-error 438, dropped-placement 120, untranslated-code 27, class-omitted 20, unrecoverable-class 19 (62 before the Checkpoint 2 fix). unsupported-features.json has 1160 entries: filter 861, morph-shape 169, sound 38, untranslated-code 27, class-omitted 20, unrecoverable-class 19, text-metrics 13, text 10, button-sound 1, obfuscation-recovered 1, stroke-style 1.
- The 28 fewer type errors: TS2304 16 to 0 (all named SimpleButton), TS2551 32 to 18, TS2339 348 to 350; TS2306 64, TS4112 5, TS7053 1 unchanged. Six TS2339 messages now name SimpleButton members the Shim lacks. The TS2551 drop of 14 was not traced. The 42 fewer dropped placements follow from buttons now converting (78 to 0 entries), not traced one by one.

## Block C against tasks.md
- Task 20 delivered: `buttons.ts`, Scene_JSON 4 writer and reader, masks treat a button as a non-trivial mask. DefineButtonTag is labelled "Measured on a generated file"; five other names stay UNVERIFIED, pinned by a test.
- Task 21 delivered: pure `buttonModel`, SimpleButton, loader, drawing. The checkbox was unticked at review (finding 3) and is now ticked.
- Task 22 delivered, no D-C8 fallback.
- Task 23 delivered: fixture builder, Chromium e2e, limits listing, tests.
- Property 23 is real. Property 24 is real but weaker than its title: it drives the first hover entry through the Player at a random placement matrix and no click. Property 25 is real through the Player (move, down, up; a disabled button stays up with 0 mouseDown events); it does not drive releaseOutside separately.
- Button screenshot `.work/button-fixture-over.png`: 300x200, a 100x100 green square at (50,50), nothing in the hit-only area (the over colour).

### Block C facts, U and A items and the task that built each
The A-number to task mapping is the helper's reading of the task text, not a table in the spec.

| Item | Built by |
|---|---|
| U1 | 2.3, 10.1, 10.2, 18.4, 19 |
| U2 | 1.2, 7.1, 12.2 |
| U3 | 14.2 |
| U4 | 7.1, 8.1, 12.2 |
| U5 | 20.1 |
| U6 | 22.1, 22.2 |
| U7 | 3.1 |
| U8 | 15.1 |
| U9 | 6.1, 12.1 |
| A1 | 10 and 18.4 |
| A3 | 20 and 21.1 |
| A4 | 22.1 |
| A5 | 23 |
| A7 | 7.2 |
| A8 | 3.1 |
| A9 | 14.2 |
| A10 | 12.1 |
| A11 | 1.1 |
| A12 | 15.1 |
| A13 | 9 (51f7aae) |
| A14 | 18 |
| A15 | 17 (6ea17bf) |

A2 and A6 were rejected and replaced by U1 and D-B5.

## Ruffle evidence for hover
The reviewer read `.work/ruffle-src/core/src/player.rs` and `display_object/interactive.rs`.
- mouseOut, mouseOver and releaseOutside bubble; rollOut and rollOver do not (interactive.rs 409 to 512). Roll events walk to the lowest common ancestor (424 to 495).
- Leaving fires mouseOut then the rollOut chain; entering fires the rollOver chain then mouseOver. DragOut and DragOver share the arms of RollOut and RollOver.
- ReleaseOutside goes to the pressed object at player.rs 1797, followed by RollOver at 1815.
- `avm2_button.rs` was not available. The button state table and the disabled rule are labelled "read by the design, not re-read". O10 (set_enabled state reset) was neither read nor measured.

## Findings
1. Double mouseOut/rollOut and mouseOver/rollOver on a drag, copied from Ruffle (player.rs 1614 to 1619 and 1645 to 1650). Probably a Ruffle quirk, not measured against Flash. Owner decision, open.
2. Hover runs before mouseMove. Ruffle runs the target's mouseMove first (player.rs 1520 to 1525). The change is one line in `player.ts` pointerEntry. Owner decision, open.
3. The Task 21 checkbox was unticked. Fixed by the orchestrator; tasks.md is committed with this review.
4. Property 24 said "click" in its title while checking the first hover entry. Fixed (see Fixes).
5. tech.md still said buttons are read but not drawn until Block C task 21. Fixed (see Fixes).
6. Commit subject 4dc03b8 has 73 characters (like 9f13dbf), and 8fb62b9 used the area `Outcome`. Known, recorded only.
7. Warm_Suite_Time 188 s against a target of about 150 s. Intermittent load timeouts of outcome.property, recover.property, facts.property, signal.e2e and the keyCodes and render afterAll hooks under large parallel batches; they pass alone and no timeout was raised. Recorded only.

## Fixes
- f12bbb1 `Steering: tech.md status says buttons are drawn` (finding 5). The status paragraph now says buttons are converted to Scene_JSON 4 (only with a button), drawn, that hover, roll and click events reach them, and that limits are listed. formatVersion text was already right (3, or 4 with a button; reader accepts 2, 3, 4). structure.md has no stale button sentence. The "version 4 arrives with buttons in Block C" wording exists only in the text of task 9.1 in tasks.md, a record of a finished task, left unchanged.
- 1d081d1 `Test: Property 24 names the pointer event it checks` (finding 4). Title and comment changed; the assertion is unchanged.
- Finding 3: the Task 21 box, set by the orchestrator, committed with this review.

## Owner decisions open
1. Double mouseOut/rollOut and mouseOver/rollOver on a drag (finding 1).
2. Order of hover and mouseMove (finding 2).

## Not run or verified by the reviewer
Credits_Line (the owner reads the meter; it is not available to the agent); suite stability beyond one run; Playwright MCP on the screenshot; `avm2_button.rs` and O10; the after-task.ts hook; the Property 23 generator and the full diffs of ca1667f and c9337f6; the cause of the redball4 slowdown.
