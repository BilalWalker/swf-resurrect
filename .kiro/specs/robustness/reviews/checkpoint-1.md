# Checkpoint 1 review (fidelity-reviewer)

Checkpoint 1 review (robustness Block A), wip/as3-coverage at eff6683

Verdict: holds with findings. Nothing in Block A moves a score or its measurement. The full suite is not clean: it failed differently in each of the two runs (earlier and mine), and I could not tell the earlier failures from load on a baseline.

Checks
- Branch is wip/as3-coverage. `git status` shows only `.kiro/specs/robustness/tasks.md` and `tasks.meta.json` modified (uncommitted spec edits).
- Commits: 3d80ace through eff6683, 18 commits.
- `npm run typecheck` and `npm run typecheck:template` are both clean.
- My own `npm test -- --run` took 254 s. It failed three files and passed 285 of 288, with 1 failed and 2023 passed of 2025 tests: `test/property/residual.property.test.ts` (Property 27, after 196 of 200 runs, seed 368318246); `test/e2e/keyCodes.e2e.test.ts` (suite-level failure); `test/e2e/render.e2e.test.ts` (suite-level failure). The processTree and spacerLoad failures from `.work/full-suite-2.log` did not recur.
- I reran the five files that failed in either run alone: residual, keyCodes, render, processTree and spacerLoad. All pass (21 of 21 tests, 4 s). I reran residual alone 28 more times and it did not fail again.
- Floors and tolerance: unchanged. `git diff main HEAD` over `src/verify/core`, `samples`, `test/fixtures`, `test/unit/clickgotoReplay.test.ts` and `test/e2e/overallMatch.e2e.test.ts` is empty. Floors: `TRACE_SCORE_FLOOR` 100; `OVERALL_MATCH_FLOOR_*` clickgoto 100, tweendemo 100, radial 100, gradients 99.41, acid-color-2 100, mask_reapply 99.99, click_block 95.75, 3_joystick 98.86, slider_component 99.93, entity_game 100, spacer 100.
- Reference data and goldens: unchanged. Block A touches `src/verify/edge/launchChromium.ts` and `replay.ts`; they now use `track`/`killTree` from `src/pipeline/processTree`; no scoring logic in the diff.
- main is `ef8b9b3` and is behind HEAD by 121 commits.

Scores (measured from `.work/shared-runs/*/out/fidelity-report.json`, outputs from 11:22 to 11:28; pipeline not rerun)

| Sample | Overall_Match | Trace_Score | Outcome | Named cause of any gap |
|---|---|---|---|---|
| clickgoto | 100 | 100 | converted | none needed |
| tweendemo | 100 | not compared | converted | none needed |
| radial | 100 | not compared | converted | none needed |
| gradients | 99.41 | not compared | converted | not checked |
| acid-color-2 | 100 | not compared | converted | none needed |
| mask_reapply | 99.99 | 100 | converted-with-gaps (2 type errors) | type-error gap listed |
| click_block | 95.75 | 100 | converted-with-gaps (dropped-placement 1) | dropped-placement gap listed |
| 3_joystick | 98.86 | 75 (3 of 4 lines) | converted-with-gaps | untranslated-code: `with` unsupported in code.Interactivity3; about 25 residual-difference entries |
| slider_component | 99.93 | 25 (1 of 4 lines) | converted-with-gaps: 20 of 27 translated, 182 type errors, 7 omitted | type-error, untranslated-code and class-omitted gaps listed; not verified that the missing trace lines come from them |
| entity_game | 100 | not compared | converted | none needed |
| spacer | 100 | not compared | converted | none needed |
| static_text | 100 | 0 (0 of 3 lines matched, 1 extra) | converted-with-gaps | untranslated-code: `try` unsupported in class Test |

Every committed sample and the two fetched ones end converted or converted-with-gaps; Requirement 4.10 holds. static_text has no `knownBehaviourGaps` entry for its Trace_Score of 0.

Hostile_Fixtures and local files
- `.work/hostile-matrix.md` matches the matrix: empty and text file not-swf 3; no body, cut file, damaged CWS damaged 3; AS1/AS2 actionscript-1-2 3; above lowered size limit too-large 3; encrypted only through decideOutcome (no pipeline signal, not an end-to-end result); time-limit (fake clock) refused 3; FFDec exit at Unpack damaged 3; TypeError at Unpack failed internal-error 1; AS3 with no DoABC converted 0; one candidate none translated nothing-translated 3.
- Local files: empty.swf not-swf, text.swf not-swf, truncated.swf damaged, redball4.swf time-limit; all exit 3.
- redball4: the summary records `unpack=error:60065ms` at default limits. The unpack allowance is 120 s (weight 2), so a kill at about 60 s does not match the weight; possibly the 60 s FFDec per-call timeout, not checked. Check before using the number as the first reading of Requirement 6.16.

Amendments
- Translated-count rule (7e0ff0c, b626af6): requirements.md 4.9 agrees with the code: a class counts when Emit registered it, it is not omitted, it parses, and it is clean, loose, an applied override, or kept with untranslated code; a D5 fallback never counts; numbers kept apart (translatedClasses, omittedClasses, untranslatedCodeClasses). Checked on slider_component (20 translated, 1 untranslated-code, 7 omitted), 3_joystick ("1 of 1 (1 with untranslated code)"), static_text ("2 of 2 (1 with untranslated code)"). Not checked: the full design.md amendment text, and the D5-fallback path beyond its commit message.
- S3 (87bcae9): the design S3 row describes the restored bracket text and the indented second line. Code not read against the full design row.

Full-suite judgment
- Earlier failures (processTree unknown pid at 5000 ms, spacerLoad page wait 30 s) look like load effects: both pass alone and did not recur.
- keyCodes and render failures in my run look like load effects too.
- residual Property 27: seeded failure in code Block A did not touch (identical to main); did not fail in 28 further runs; suspected rare equal-area tie in `attributeRegions`, not reproduced; intermittent and pre-existing.
- Cannot confirm Block A caused no timing regression: three full runs, each failing different tests. Warm_Suite_Time 211 s and 254 s against about 150 s; main not run for comparison (Requirement 12.6 asks to name a slower suite).

Findings, most serious first
1. The default suite is not green in either of two full runs, the failing tests differ each time, and both runs are well above the 150 s target. Make the timeout-prone tests cheaper (processTree, spacerLoad, keyCodes, render) instead of raising timeouts.
2. `test/property/residual.property.test.ts` (Property 27) intermittent failure on seed 368318246; code and test identical to main; pin the seed or look at the tie-break in `better`.
3. The redball4 unpack time of 60065 ms against an allowance of 120 s needs an explanation.
4. static_text Trace_Score 0 and slider_component 25 have no `knownBehaviourGaps` entry; the cause is only in the untranslated-code and type-error features.

Not run or not verified
- `node scripts/hooks/after-task.ts` and commit message format and BOM for the 18 commits.
- The pipeline with `--verify --force` into `.work/review/`.
- Any SWF tag or reference frame for any claimed cause (no swf_summary, swf_find_tags, swf_class_source or swf_reference_frame calls); fidelity_summary on static_text and 3_joystick only.
- Commit diffs beyond src/verify; Flash-behaviour and steering claims; S1, S2 and S4 individually.

## Status of findings

All four findings are fixed. Two consecutive runs of `npm test -- --run` (no SWF_RESURRECT_LOCAL_FILES) were fully green: run A 288 files passed, 1 skipped, 2025 tests passed, 5 skipped, main phase 119.30 s, second phase 2 tests 7.37 s, total 128.8 s; run B same counts, main phase 154.74 s, second phase 6.94 s, total 164.0 s. Logs: `.work/cp1-run-a.log`, `.work/cp1-run-b.log`.

1. Fixed by 6033721. Cause: the local-file test ran redball4 in the default suite. It now runs only with `npm run test:local-files`.
2. Fixed by 202f100 (tie-break by box in `better`).
3. Fixed by 28e8a32. Cause: a fixed 60 s FFDec per-call timeout in `src/unpack/unpack.ts`. Each call is now bounded by the remaining stage allowance. Open: `src/verify/edge/ffdecFrames.ts` keeps a fixed 120 s, inside the 180 s verify allowance.
4. Fixed by 313cced (`knownBehaviourGaps` for static_text and slider_component; both causes measured).

Accepted open by the owner, no work now:
- Encryption is not detected in a real run (stated in `docs/outcome.md`).
- SIGTERM on Windows (O5).
- The synchronous stage that cannot be interrupted (O1).
- The 300 s run limit against the web server's 180 s (passed to the UI side).