# Checkpoint 5 review (fidelity-reviewer)
Checkpoint 5 review (robustness Block E, final), wip/as3-coverage at ef4db3d
Verdict: holds with findings. No blocking finding. Findings 2 and 3 are fixed in commit d43a3a3 and findings 4 and 7 (minor) in commit 977622e (see Fixes). Finding 1 is an owner decision, open.
## Checks
- Range: 5 commits since 2caa26a (01a176b, 8cab7e1, a74468c, f27bd67, ef4db3d), 70 files. `npm run typecheck` and `npm run typecheck:template` are clean.
- Full suite (reviewer, one run): 328 files, 2360 tests, 2 failed, 175.9 s vitest, 184.8 s wall. The two failures are the two `Property 3: a run whose Unpack throws` tests of `outcome.property` at their 5000 ms limit under load; the file passes alone, 19 of 19, in 2.9 s. `launchChromium.e2e` passed. No timeout was raised.
- Rerun by hand, 43 of 43 pass: both Play_Tests (Node and Chromium), the hostile matrix, `clickgotoReplay`, `overallMatch` e2e, `preloaderPattern`.
- Floors, tolerance, `pixelDiff.ts`, Reference_Frames, goldens, `samples/` and `test/fixtures/` are unchanged against main and 2caa26a. `web/` and `mcp/` are unchanged in the range. `scene.json` is byte-identical to Checkpoint 4 for all 10 committed samples; the only other differing outputs are the four shim template files Block E changed (`events.ts`, `Keyboard.ts`, `MovieClip.ts`, `ADDED_APIS.md`). Scores are unchanged from Checkpoint 4 (slider_component type errors 173, Checkpoint 4 had 177).
- Commit hygiene: fine. `after-task.ts` reports the three old problems (4dc03b8, 9f13dbf, 8fb62b9). The reviewer asks that the box of task 33 be closed (the orchestrator does it).
## Scores (helper's Checkpoint 5 run, fresh `--verify`; 0 Fidelity_report problems)
| Sample | Overall_Match | Trace_Score | Type errors | Outcome | Considered of total, translated |
|---|---|---|---|---|---|
| clickgoto | 100 | 100 | 0 | converted | 4 of 4, 4 |
| tweendemo | 100 | not compared | 0 | converted | 4 of 4, 4 |
| radial | 100 | not compared | 0 | converted | 0 of 0, 0 |
| gradients | 99.41 | not compared | 0 | converted | 0 of 0, 0 |
| acid-color-2 | 100 | not compared | 0 | converted | 0 of 0, 0 |
| mask_reapply | 99.99 | 100 | 2 | converted-with-gaps | 1 of 1, 1 |
| click_block | 95.75 | 100 | 0 | converted-with-gaps (1 dropped placement) | 1 of 1, 1 |
| 3_joystick | 98.86 | 75 | 0 | converted-with-gaps (`with` untranslated) | 1 of 1, 1 |
| slider_component | 99.93 | 25 | 173 | converted-with-gaps | 27 of 27, 20 |
| entity_game | 100 | not compared | 0 | converted | 23 of 23, 23 |
| static_text | 100 | 0 | 0 | converted-with-gaps (one flash-api-gap, one untranslated) | 2 of 2, 2 |
| spacer | 100 | not compared | 0 | converted | 24 of 24, 24 |
## Play_Tests
Both Play_Tests (`entityPlay` and `spacerPlay`, each in Node and Chromium) pass (helper: 4 files, 6 tests; reviewer: part of the 43 of 43 above).
## Hostile fixtures (13 tests, same matrix as Checkpoints 3 and 4, unchanged)
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
## Local files, default limits, no --verify (numbers only; the helper's run, `.work/cp5/collect.txt`)
| File | Outcome | Considered of total | Translated | Type errors | Dropped | Time (s) |
|---|---|---|---|---|---|---|
| earntodie | converted-with-gaps | 101 of 536 | 53 | 3 | 73 | 198 (helper), 117 (reviewer) |
| giveuprobot | converted-with-gaps | 263 of 266 | 125 | 323 | 0 | 26 |
| burritobison | converted-with-gaps (embedded-swf gap) | 26 of 27 | 22 | 39 | 10 | 18 |
| canabalt | converted-with-gaps | 169 of 172 | 58 | 192 | 0 | 16 |
| papaspizzeria | refused actionscript-1-2, exit 3 | none | none | none | none | 2 |
| run2 | converted-with-gaps (recovered) | 291 of 302 | 176 | 4390 | 34 | 62 |
| redball4 | helper: refused time-limit in Convert (twice, heavy machine load); reviewer: 3 runs converted-with-gaps | 81 of 225 | 42 | 431 | not stated | 86 to 102 (reviewer) |
Reason sentences, verbatim from `.work/cp5/collect.txt` (helper's run):
- earntodie: `53 of 101 classes translated (101 of 536 classes considered), 3 type errors; most gaps: dropped-placement (73), untranslated-code (48)`
- giveuprobot: `125 of 263 classes translated (263 of 266 classes considered) (6 with untranslated code), 323 type errors; most gaps: type-error (323), class-omitted (138)`
- burritobison: `the file is a wrapper around another SWF that was not converted (1 embedded, 7.0 MiB); 22 of 26 classes translated (26 of 27 classes considered) (2 with untranslated code), 39 type errors`
- canabalt: `58 of 169 classes translated (169 of 172 classes considered) (1 with untranslated code), 192 type errors; most gaps: type-error (192), class-omitted (111)`
- papaspizzeria: `the file uses ActionScript 1 or 2, which is not supported`
- run2: `obfuscated: names renamed, 176 of 291 classes recovered; 176 of 291 classes translated (291 of 302 classes considered) (38 with untranslated code), 4390 type errors`
- redball4 (helper, both runs): `time limit reached in the convert stage (60 s stage limit)`. Stage times of the first run: recover 30267 ms, unpack 35312 ms, convert 60021 ms.
Stage times of the helper's run for the other files (ms, unpack / convert / translate / emit): earntodie 142867 / 21336 / 22147 / 7622; giveuprobot 4262 / 2839 / 4514 / 12311; burritobison 6111 / 3393 / 721 / 5596; canabalt 5221 / 2151 / 1981 / 4804; run2 (recover 14470) 10319 / 11763 / 4720 / 10351.
Samples (helper, fresh `--verify`, with the stage times in ms of unpack / convert / translate / emit / verify): clickgoto 6233 / 1525 / 2365 / 34828 / 8375; tweendemo 2706 / 78 / 177 / 2976 / 9447; entity_game 2935 / 76 / 705 / 3901 / 5901; spacer 4412 / 759 / 632 / 5588 / 9146.
## Before and after (task 31.4, commit a74468c; considered of total, translated, type errors, dropped placements; before to after)
| File | Considered of total | Translated | Type errors | Dropped | Time (s) |
|---|---|---|---|---|---|
| canabalt | 10/172 to 169/172 | 4 to 58 | 43 to 199 | 0 to 0 | 17.1 |
| giveuprobot | 21/266 to 263/266 | 16 to 125 | 47 to 334 | 0 to 0 | 20.2 |
| earntodie | 100/536 to 101/536 | 53 to 53 | 50 to 50 | 73 to 73 | 164.8 |
| burritobison | 26/27 to 26/27 | 22 to 22 | 40 to 40 | 10 to 10 | 16.8 |
| redball4 | 56/225 to 81/225 | 17 to 42 | 438 to 438 | 120 to 120 | 91.9 |
| run2 | 291/302 to 291/302 | 176 to 176 | 4404 to 4404 | 34 to 34 | 67.9 |
| papaspizzeria | refused actionscript-1-2, exit 3 | | | | 1.7 |
All others ended converted-with-gaps, exit 0; none ended `refused time-limit` in that run. Earlier wall times were not recorded. The sample scores before (Checkpoint 4) and after are the same.
## Type-error groups (task 33.1, D-E4; the three largest local files, 583 errors in 104 groups, before the fixes)
Per-file type errors before and after the fixes: file A 199 to 192, file B 334 to 323, file C 50 to 3 (583 to 518). Classes considered and translated are unchanged.
| # | Group | Total | A | B | C | Disposition |
|---|---|---|---|---|---|---|
| 1 | `TS2345` argument to a framework base class `<Entity>`: a private member `_<field>` of the base that the subclass also declares | 100 | 0 | 100 | 0 | Open_Item 1 |
| 2 | `TS2306` a class file is not a module (`src/classes.ts` imports the D5 fallback file of an obfuscated class) | 50 | 0 | 0 | 50 | fixed |
| 3 | `TS2304` name `BitmapData` | 47 | 26 | 21 | 0 | Open_Item 2 |
| 4 | `TS2304` name `Bitmap` | 41 | 36 | 5 | 0 | Open_Item 2 |
| 5 | `TS7015` an `Array` indexed by a string | 39 | 0 | 39 | 0 | Open_Item 3 |
| 6 | `TS2304` name `Matrix` | 14 | 7 | 7 | 0 | Open_Item 2 |
| 7 | `TS2304` name `ColorTransform` | 13 | 3 | 10 | 0 | Open_Item 2 |
| 8 | `TS2304` name `TextFormat` | 12 | 10 | 2 | 0 | Open_Item 4 |
| 9 | `TS2339` `Event.SOUND_COMPLETE` | 11 | 2 | 9 | 0 | fixed |
| 10 | `TS2339` `TextField.defaultTextFormat` | 10 | 10 | 0 | 0 | Open_Item 4 |
Fixed (general, small, tested): fallback files of unparsed classes are left out of `classes.ts` (50 errors); `Event.COMPLETE`, `Event.SOUND_COMPLETE`, `Event.ACTIVATE`, `Event.DEACTIVATE` and `Keyboard.TAB` constants, labelled "neither read nor measured" (18 errors). The `TextFormat` and `TextField` members group (about 63 errors) is stub-able and is the largest cheap group left; a `Screen.setPixel` group of 9 also remains.
## Findings
1. The Convert time-limit regression the helper saw is not caused by Block E. Three redball4 runs at HEAD with CPU load of 1 to 17 percent: convert 25.3, 19.8 and 17.5 s (recover 28.2, 25.7, 25.6; unpack 28.3, 27.0, 26.7; translate 3.5, 3.8, 3.2; emit 7.4, 7.9, 6.6); Checkpoint 4 had 21.9 s. `git diff 2caa26a..HEAD` over `src/convert`, `src/facts` and `src/recover` is empty. The helper's two refusals came from machine load. The Convert margin (60 s allowance, 17 to 25 s used on a quiet machine) is thin under load: owner decision 1.
2. Stale unpack weight 2 in `requirements.md` (Stage_Weight definition, Requirement 6.2) and in `tasks.md` (U1 row, task 10.1 text). Code, docs, tech.md and Requirement 27.10 say 3. The allowances 120, 180, 60, 60, 60, 60, 180 s (720 s against the 300 s run limit) are documented consistently apart from this. Fixed.
3. `tasks.md` (Block E preamble, about line 453) named a local game's preloader base class, the framework and a main-class literal. Code, tests, docs and `.work` are clean. Fixed with generic wording.
4. The Property 6 relaxation was broader than needed. Numbers stay in the numbers and real sentences keep everything (the longest is about 160 characters), but a bug that dropped the type-error count or the untranslated-code part from a short sentence would have passed. Property 29 is real. Fixed.
5. The committed samples are unaffected by reach rule (b) and the considered clause.
6. earntodie reaches 101 of 536, which is acceptable. Rule (b) already scans the raw source of fallback classes. Literals from the 101 reach 101; adding the imports and `extends` of the 48 parse-failed classes reaches 110, of every class 128. Most of the 435 are not statically reachable.
7. canabalt: the 3 unconsidered classes are an embedded-font holder, a Flex font-asset class and a namespace declaration. The D-E2 table reproduces (169 of 172, 263 of 266). The rule is not keyed on any framework or file name. Minor: `callsDefinitionLookup` skipped only `//` lines, not `/* */` blocks. Fixed.
8. The preloader test is real: `Player`, `FakeBackend`, `ManualClock` and Fixture_Class text through the real Translator and `planEmitDetailed`. Ruffle `movie_clip.rs` `next_frame` (line 840) and `frames_loaded` (line 3355) match `flash-behaviour.md`. Our `nextFrame` stays inside the current scene. The frame-gating difference is recorded as an Open_Item and tested.
9. Unpack: the semantics are right. Both parallel calls get the whole stage allowance. Error order: dump, then not-AS3 or XML version, then export. A dump failure aborts the export through `AbortSignal` and `killTree`. earntodie Unpack takes 81.0 s at HEAD (93 s quiet, 142.9 s loaded), total 117 s. The memory of about 4 GB with two JVMs is not verified by the reviewer.
10. The D-E4 table reproduces: 192, 323 and 3 errors (518 in all). The three fixes are general, small and tested.
11. Hygiene is fine apart from the three old notes.
## Warm_Suite_Time
- Helper run 1: 162.3 s, with `launchChromium.e2e` failing twice at its own 20 s limit under load. Helper run 2: 128.5 s, fully green.
- Reviewer run: 184.8 s wall (175.9 s vitest); the two `Property 3` tests of `outcome.property` timed out at 5000 ms under load, and the file passes alone in 2.9 s. Target about 150 s. Recorded only; no timeout was raised.
## Fixes
- A: d43a3a3 `Spec: unpack weight 3 in the current text, generic preloader wording` (findings 2 and 3). `requirements.md` and `design.md` now say unpack 3; the U1 rows and the 10.1 text are annotated `(superseded: unpack weight is 3, Task 32)`; the Block E preamble in `tasks.md` is generic. A grep of the spec, steering and docs for game and framework class names found nothing else.
- B: 977622e `Test: keep code and type-error parts in short reasons; skip block comments` (findings 4 and 7). Property 6 builds the unreduced sentence from the record (D-E1 drop order) and requires the type-error part and the untranslated-code part unless that sentence is over 200 characters. `callsDefinitionLookup` strips block comments first, with a unit test. Typecheck clean; `outcome.property` and `classNameLiterals` pass alone (24 tests); `vitest related` on `planEmit.ts` 235 tests pass.
- C: this review, with `tasks.md` and `tasks.meta.json`.
## Owner decisions open
1. Convert stage allowance of 60 s (weight 1). redball4 converts in 17 to 25 s on a quiet machine but ended `refused time-limit` in Convert twice under heavy external load in the helper's run. Convert code is unchanged since 2caa26a (`git diff` empty). Options: give Convert weight 2, or accept.
2. Hosted container memory: two FFDec JVMs in parallel peak at about 4 GB, measured on a 32 GB machine and not re-measured by the reviewer.
3. Type-error groups left open: the policy-gap Flash classes `BitmapData`, `Bitmap`, `Matrix` and `ColorTransform` (115 errors); the `TextFormat` and `TextField` members group (about 63 errors, stub-able; not fixed because of the "small and general" rule and the cap of 4 fixes), proposed for a decision; the 100-error private-field-in-base-class group (a rename rule, a design question); string-keyed `Array` (39).
4. Frame gating of `getDefinitionByName`: Ruffle throws error #1065 on frame 1 for a class linked in frame 2; ours succeeds. Scene_JSON lacks the frame of each SymbolClass pair.
5. earntodie reaches 101 of 536 classes; most of the rest are not statically reachable (the literal scan plus the imports of the parse-failed classes would add only 9).
6. `nextFrame` across scenes is unread in Ruffle.
7. Load timeouts remain (`launchChromium.e2e`, `outcome.property` Property 3, `recover.property`, `facts.property`, `signal.e2e`), as do cold-cache full runs. No timeout was raised.
8. The open items of Checkpoints 3 and 4 are unchanged: hover order, double drag events, `refused damaged` rows for a move at an empty depth and `UNKNOWN_SYMBOL`, the web side lives on wip/ui, no real broken-frame SWF goes through the CLI.
9. Hygiene notes on 9f13dbf and 4dc03b8 (73-character subjects) and 8fb62b9 (area `Outcome`) cannot be amended.
## Not run or verified by the reviewer
Convert profiling and a `git archive` copy of 2caa26a; Unpack memory; the cause lines of the 3_joystick, slider_component and static_text reports; the Ruffle `get_definition_by_name` file; the `Event` and `Keyboard` constant values (documentation only); frame gating; O3, O4 and the other `flash-behaviour.md` Open_Items.
Credits_Line: not available to the agent (there is no meter), so the credits of Block E are not stated. Any per-task estimate in a commit body is a guess, not a measurement.
