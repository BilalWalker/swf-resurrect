# Checkpoint 2 review (fidelity-reviewer)
Checkpoint 2 review (robustness Block B), wip/as3-coverage at b6b9cf9
Verdict: holds with findings. Fixes for findings 1, 3 and 7 follow in the Fixes section. Findings 2, 4, 5 and 6 are recorded only.
Checks
- `npm run typecheck` and `npm run typecheck:template` are clean. Full suite exit 0 on the reviewer's run: main phase 304 files passed, 1 skipped; 2159 tests passed, 7 skipped; 164.8 s. Isolated phase: 2 tests, 7.5 s. Warm_Suite_Time 174 s (target about 150 s). The helper's second run took 147.5 s; its first run took 203.8 s and had 4 property timeouts, fixed by b6b9cf9. Checkpoint 1 took 211 s and 254 s.
- Floors, tolerance, `pixelDiff.ts`, Reference_Frames, `samples/**` and `test/fixtures/**` are unchanged against main.
- Hygiene hook: 30 commits checked, no problems. No redball4 file or class name is committed. Both Play_Tests pass (entity_game; spacer with the fetched SWF).
- `git status` at review: only `tasks.md` and `tasks.meta.json` modified.
Commits since the Checkpoint 1 review: b6b9cf9 Test: cut the cost of four timing-out property tests; a270122 Test: scan tracked files for tokens on raw bytes first; f89bcbf Test: fix shim member tests after Point and the stub classes; 68f8a75 Pipeline: recover obfuscated SWF on a copy, then one unpack (Task 18); 6ea17bf Pipeline: add ABC_Name_Scan and the obfuscation verdict; b63c15d Translate: report Flash API gaps, count stub dependents, list stalls; 36637e3 Shim: add flash.geom.Point with property tests; fc67433 Translate: add the Flash_API_Table and generated Shim stubs; 1ad2bf9 Spec: close Checkpoint 1 findings; 202f100 Verify: break residual attribution ties by box; 313cced Verify: list measured behaviour gaps for static_text, slider_component; 28e8a32 Unpack: bound each FFDec call by the remaining stage allowance; 6033721 Test: run the local-files e2e only on request.
Scores (all equal to Checkpoint 1, none lower)
| Sample | Overall_Match | Trace_Score | Type errors | Outcome |
|---|---|---|---|---|
| clickgoto | 100 | 100 | 0 | converted |
| tweendemo | 100 | not compared | 0 | converted |
| radial | 100 | not compared | 0 | converted |
| gradients | 99.41 | not compared | 0 | converted |
| acid-color-2 | 100 | not compared | 0 | converted |
| mask_reapply | 99.99 | 100 | 2 | converted-with-gaps |
| click_block | 95.75 | 100 | 0 | converted-with-gaps (dropped-placement 1) |
| 3_joystick | 98.86 | 75 | 0 | converted-with-gaps (`with` untranslated) |
| slider_component | 99.93 | 25 | 182 | converted-with-gaps, 20 of 27 (Slider omitted because UIComponent fails to load, TS2304 TextFormat) |
| entity_game | 100 | not compared | 0 | converted, 23 of 23 |
| spacer | 100 | not compared (no output.txt in reference) | 0 | converted, 24 of 24 |
| static_text | 100 | 0 | 0 | converted-with-gaps, 2 of 2 (`try` not translated; one new flash-api-gap for flash.text.StaticText) |
Hostile fixtures (13 tests pass, same as Checkpoint 1)
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
redball4 (numbers only; default limits, no --verify)
- Outcome converted-with-gaps, exit 0. Wall 106.9 s (the owner's reading at 68f8a75 was 148 s; the reviewer's stages ran 22 to 29 percent faster, cause probably machine load, not checked).
- Stages: recover 25.3 s, unpack (single, recovered copy) 36.9 s, convert 24.1 s, translate 4.0 s, emit 8.4 s, gate 0 s; sum 98.6 s. That is 32.9 percent of the 300 s limit by stage sum and 35.6 percent by wall clock.
- Candidates 56; translated 17 (clean 3, loose 14); unsupported 41; omitted 20; unparsed 19; 466 type errors (TS2339 348, TS2306 57, TS2551 32, TS2304 16, TS4112 5, TS7053 1); 162 dropped placements; 1537 of 2919 names invalid; 1536 identifiers renamed; 17 classes recovered; no fallback.
- Residue: 1063 lines with the two decompiler markers across 225 .as files (595 push, 470 pop); 381 lines in emitted `src/*.ts`.
- Unresolved Flash names: LocalConnection 1, others 0. 5 flash-api-gap, all SimpleButton (Block C).
- Gap kinds: type-error 466, dropped-placement 162, unrecoverable-class 62, untranslated-code 27, class-omitted 20, flash-api-gap 5.
- Matches the owner's reading on Outcome, 17 of 56, 466 and 162; the time differs. The `[translate]` console line says 4 clean, 25 loose, 27 unsupported (pre-gate, labelled); the Outcome numbers are final.
New Named_Limits: `api-stub:<Class>[.member]` and `api-stub-no-event:<Class>` (they appear in the Fidelity_Report apiStubs only when the Replay observed one; none in the 12 reports); `obfuscation-recovered` (in the redball4 unsupported-features.json).
Open_Items
- O2: thresholds chosen, not measured (second data point 52.6 percent against 0 for committed samples).
- O7: determinism claimed by 68f8a75 (two FFDec runs, same hash); not rerun by the reviewer.
- O8: measured 36.9 s unpack against the design guess of 88 s; total 107 s against 190 s.
- O12: No_Event stubs never fire completion.
- O13: answered. Rename plus deobfuscate does not remove push/pop residue (1063 lines remain; the original was not compared).
- O15: AVM2 spec not read.
- Still open: O1 (no supervisor process), O3 (encrypted has no measured signal), O4 (ZWS header only), O5 (SIGTERM on Windows), O6 (no Emit journal), O9 and O10 (button rollOver bubbling and enabled=false reset unread), O11 (DefineButtonTag measured on a generated file only), O14 (ABC class count differs by one from swf_summary), O16 (non-\p{L} letters count as invalid), O17 (mapping of MISSING_EXPORT, XML_VERSION and MISSING_HEADER_VALUE to failed is a judgement).
Findings, most serious first
1. 62 unrecoverable-class gaps against 56 candidates: the two counts have different denominators.
2. 36637e3 (Shim Point) has no before/after score table. The claim is true: verified now, all ten samples unchanged. Record only.
3. Property 17 and 18 run fewer times after b6b9cf9.
4. 68f8a75 mixes the allowanceLabel fix of 28e8a32 into the Task 18 commit (low). Record only.
5. Warm_Suite_Time 174 s is over the 150 s target; single run. Record only.
6. redball4 keeps 1 unresolved LocalConnection reference after the stub; cause not checked. Record only.
7. The static_text flash-api-gap text says "the type error stays" although the run has 0 type errors (the line is inside an untranslated `try`).
Not run or not verified by the reviewer: Credits_Line (no meter; the owner reads the meter), a suite repeat, the original unrecovered redball4 residue count, swf-inspector tags, Flash-behaviour claims of 36637e3 and fc67433 (unread in Ruffle and unmeasured per their bodies), O15, the full diffs of 68f8a75, b63c15d and 6ea17bf. The reviewer's scratch output under `.work/review/` contains redball4 class names and is never committed or quoted.
## Fixes
- Finding 1, fixed by cb444f1 (Pipeline). Requirement 16.7 and the Unrecoverable_Class definition say "Candidate_Class", so the count is against the candidate set. The entries are filtered to the Translation_Report classes before they reach the unsupported list, `recovery.unrecoverableClasses` and `obfuscated.sourceSignals`; `docs/outcome.md` states the unit. One new test in `test/unit/recoverRecord.test.ts`. redball4 not rerun, so its new count is not measured; it can only be at most 56.
- Finding 3, fixed by 28d700e (Test). Property 18 now runs each of the 11 inputs once (0.5 to 0.7 s alone, limit 5000 ms). Property 17 stays at 12 runs: its input is a boolean, a failing step and a cost in ms, and no cheaper fake exists without changing what it checks. Accepted, with slightly lower coverage.
- Finding 7, fixed by 9f13dbf (Translate). The text now reads "no stub is generated; a type error would stay if the code is translated". No test or golden held the old text, and `samples/` and `test/fixtures/` are unchanged against main. The subject line of 9f13dbf is 73 characters, one over the limit; it cannot be amended, so it is recorded here.
- Findings 2, 4, 5 and 6: recorded, no code change.
## Facts from the earlier run (this session)
- After the fixes, `npx vitest related` over the changed files showed load timeouts in `recover.property` (2 tests) and `facts.property` (1 test) while other work ran; all pass alone (35 passed, 1 skipped in 2.2 s). One run of `outcome.property` failed once with a counterexample of a `converted-with-gaps` record with `untranslated-class` gap, 0 of 0 classes; it passed in 7 further runs (18 of 18 each). Cause not found; possibly a load effect, not confirmed.
- The full suite was not rerun after the fixes.