# Checkpoint 4 review (fidelity-reviewer)
Checkpoint 4 review (robustness Block D, final), wip/as3-coverage at c2b7020
Verdict: holds with findings. Finding 1 (a real bug) and findings 5 and 6 are fixed in the Fixes section. Findings 2, 3, 7 and 8 hold. Findings 4 and 9 are owner decisions, open.

## Checks
- `npm run typecheck` and `npm run typecheck:template` are clean. Full suite (reviewer, one run): 192.3 s wall (vitest 182.6 s plus isolated phase 7.3 s). 321 files passed, 1 failed, 1 skipped; 2306 tests passed, 1 failed, 7 skipped. The failure is recover.property Property 17 at 5029 ms against 5000 ms; it passes alone in 1.3 s (known load flake, no timeout was raised). The helper's single run was fully green: 191.5 s, 322 files, 2307 tests.
- Targeted run, 16 files, 145 tests pass: entityPlay and spacerPlay (Node and Chromium), hostileFixtures, overallMatch, clickgotoReplay, sampleOutcomes, embeddedGap, classifyError, classLinks, outcomeDocs, Properties 26 to 28.
- Floors, `pixelDiff.ts`, tolerance, `samples/`, `test/fixtures/` and `template/shim/` are unchanged against main and 8ef2f2e. `web/` and `mcp/` are unchanged. `scene.json` is byte-identical to Checkpoint 3 for all 12 outputs. `classAliases` is written only when non-empty; the reader and writer accept aliases for formatVersion 2, 3 and 4.
- Commit hygiene: five new commits, subjects 60 to 65 characters, no BOM, no attribution, no forbidden paths. `after-task.ts` reports only the three old problems (4dc03b8, 8fb62b9, 9f13dbf). The only local-game names in tracked files are file names in tasks.md.
- Warm_Suite_Time: 192.3 s wall for the reviewer's run (helper 191.5 s), against a target of about 150 s. Recorded only.

Commits since the Checkpoint 3 review (8ef2f2e): bba0020 Convert: keep every SymbolClass name linked to its symbol; c81be86 Pipeline: end broken Convert data as refused damaged; d984b20 Pipeline: report a wrapper SWF as an embedded-swf gap; c2b7020 Docs: web side passes --run-limit, correct the 180 s note; 9cc2c11 Spec: add Block D local-file findings (tasks 25 to 29). Fixes of this review: see Fixes.

## Scores (unchanged from Checkpoint 3, 0 Fidelity_report problems)
| Sample | Overall_Match | Trace_Score | Type errors | Outcome |
|---|---|---|---|---|
| clickgoto | 100 | 100 | 0 | converted |
| tweendemo | 100 | not compared | 0 | converted |
| radial | 100 | not compared | 0 | converted |
| gradients | 99.41 | not compared | 0 | converted |
| acid-color-2 | 100 | not compared | 0 | converted |
| mask_reapply | 99.99 | 100 | 2 | converted-with-gaps |
| click_block | 95.75 | 100 | 0 | converted-with-gaps (1 dropped placement) |
| 3_joystick | 98.86 | 75 | 0 | converted-with-gaps (`with` untranslated) |
| slider_component | 99.93 | 25 | 177 | converted-with-gaps, 20 of 27 |
| entity_game | 100 | not compared | 0 | converted |
| static_text | 100 | 0 | 0 | converted-with-gaps (`try` untranslated, one flash-api-gap) |
| spacer | 100 | not compared | 0 | converted |

## Play_Tests
Both Play_Tests (`entityPlay` and `spacerPlay`, each in Node and in Chromium) pass in the targeted run of 16 files above. No Play_Test scenario changed in Block D.

## Hostile fixtures (13 tests, same matrix as Checkpoint 3)
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

## Local files, default limits, no --verify (numbers only)
| File | Outcome | Classes translated of candidates | Type errors | Time (s) |
|---|---|---|---|---|
| earntodie | converted-with-gaps | 53 of 100 | 50 | 119 |
| giveuprobot | converted-with-gaps | 16 of 21 | 47 | 23 |
| burritobison | converted-with-gaps, with an embedded-swf gap; embeddedSwfs {1, 7349081, 7349081} | 22 of 26 | 40 | 21 |
| papaspizzeria | refused actionscript-1-2, exit 3 | none | none | 23 |
| run2 | converted-with-gaps | 176 of 291 | 4404 | 78 |
| redball4 | converted-with-gaps | 17 of 56 | 438 | 102 |

`run2` matches its log from before Block D exactly. `redball4` matches Checkpoint 3 (438 type errors). earntodie and giveuprobot have 0 symbols with classAliases. None of the six ends `refused damaged` wrongly. After fix A the implementer reran earntodie (53 of 100, 50 type errors, 170 s on a busy machine) and giveuprobot (16 of 21, 47 type errors, 26 s): `scene.json` and `translation-report.json` are byte-identical to the run above, so the fix changed no output of these two files.

## Block D facts and the task that built each
| Item | What | Built by |
|---|---|---|
| 1 | Several class names for one character id stay linked (Requirement 26.1 to 26.3) | task 25, bba0020, and the dump-based class links of fix A |
| 2 | Input-broken errors end `refused damaged` (Requirement 26.4 and 26.5) | task 26, c81be86 |
| 3 | An embedded SWF is detected and reported as an `embedded-swf` gap; extraction decided against (Requirement 26.6 to 26.8) | task 27, d984b20 |
| 4 | The run-limit note in `docs/outcome.md` and elsewhere (Requirement 6.3) | task 28, c2b7020 |

## Findings
1. `symbolClassPairs()` bug in bba0020. It kept the first N lines of `symbols.csv`, assuming the SymbolClassTag pairs come first and the ExportAssetsTag pairs after. FFDec writes the pairs of both tag types concatenated in file tag order; both local files have ExportAssets, SymbolClass, ExportAssets, SymbolClass. earntodie (N = 174) dropped 13 class pairs; giveuprobot (N = 199) dropped 111 class pairs and kept 104 export-only pairs. The two scene outputs happened to be right. The fixture had the wrong tag order and Property 26 only checked the slice on lists it built in that order. Spec text to correct: D-D1a "two blocks", D-D1 evidence, the tasks.md Block D intro. Fixed (A).
2. The other D-D1 numbers hold. earntodie: 333 csv lines, 174 distinct, 174 SymbolClass pairs, no id with two names (repeats come from ExportAssets duplicates). giveuprobot: 312 lines, 303 distinct, 105 ids with two names in the csv, 199 SymbolClass pairs, 113 ExportAssets pairs of which 104 are not SymbolClass pairs. giveuprobot has one id with two different SymbolClass names (tag positions 2 and 196), a DefineBitsLossless2 bitmap, so no alias is kept; neither real file exercises classAliases. The owner's "several names for one id" is true once, and only on a bitmap.
3. The Ruffle rule is faithful: movie_clip.rs 4347 to 4435 (last pair wins through `set_avm2_class`; the None arm at 4400 to 4417 uses the first pair for id 0; `set_class_symbol` maps each alias class to the id). Doubt: Ruffle skips a pair whose class lookup fails and keeps the earlier one, while `buildClassLinks` takes the last name. Narrow, not exercised locally. Recorded as Open_Item O18 (A).
4. Doubtful table rows (owner decision a below): `MALFORMED_FRAME_DATA` for a move at an empty depth and `UNKNOWN_SYMBOL` end `refused damaged`, but Ruffle tolerates both. SYMBOL_CYCLE stays; the other four stay internal. No local file triggers any; `test/unit/brokenFrame.test.ts` was not created.
5. The 27.3 measurement does not reproduce. The inner file ended converted-with-gaps in 144 s under the default limits: 276 candidates, 192 translated, 496 type errors. The detection layout is confirmed: tag 87, character id 46, 4 zero bytes then CWS, length 6 + 7349081. Fixed (B).
6. Document and spec text: task 26 parent box is `[ ]` although 26.1 to 26.3 are done; BOM and `[~]` changed to `[-]` in the working tree tasks.md; dangling reference to a non-existent 26.9; three form-feed corruptions (Requirement 26 user story, 26.7, D-D3b); `src/outcome/reasons.ts` lost its trailing newline. Fixed (B), apart from the parent box (left to the orchestrator).
7. The `docs/outcome.md` note is accurate: wip/ui eaaf776 has DEFAULT_TIMEOUT_S 300, BACKSTOP_MARGIN_S 30 and backstopMs = runLimit + 30000; `--run-limit` argv is in `web/server/processTree.ts` lines 34 to 35. This branch's `web/` still says 180.
8. Properties 26, 27 and 28 are real. Property 26 does not check the Emit registry or the Player (unit tests do). Property 27's table is a second copy.
9. A Convert `refused damaged` writes no Failure_Log, so the cause (frame, depth, id) is lost.

## Fixes
- A: 9008ad6 `Convert: take class links from the dump, not a csv prefix` (finding 1, with the Open_Item of finding 3). `parseStructure` returns the (id, name) pairs of the SymbolClassTag items in tag order; `readUnpacked` validates the names and uses that list; `symbols.csv` is no longer read; class sources still come from the scripts directory; a model with no dump pairs keeps every csv entry. The fixture has the real tag order and the fixture test asserts the csv order FFDec writes. Property 26 now covers interleaved csv lists. Design D-D1 and D-D1a, requirement 26.3 and the Block D intro are corrected; Open_Item O18 added.
- B: eb18aed `Spec: record the 27.3 re-measurement, fix dangling refs and typos` (findings 5 and 6). Both measurements of the inner file are recorded, the claim that the default budget does not fit is removed, and the decision not to extract stays on the grounds that remain (496 type errors, 144 to 249 s of the 300 s limit depending on load, one nesting level, extraction code not built). References to 26.9 point to 6.3; three form-feed characters and the trailing newline of `reasons.ts` are repaired. Older form-feed defects (for example the `ffdecFrames.ts` mention in design.md, Block A) are only reported.
- C: this review, with tasks.md and tasks.meta.json.

## Owner decisions open
a. `MALFORMED_FRAME_DATA` for a move at an empty depth (`resolveTimeline.ts` about lines 187 and 197) and `UNKNOWN_SYMBOL` end `refused damaged`, but Ruffle (`movie_clip.rs` 4484 to 4495 does nothing for Modify or Replace at an empty depth; `instantiate_child` about 1503 warns and returns None for an unknown id) tolerates both. Flipping them means Convert records a dropped placement instead of throwing. Before Block D both ended `failed internal-error`, so no file that converted before is refused now, and no local file triggers either. SYMBOL_CYCLE stays. SHAPE_EXPORT, MALFORMED_SVG, MISSING_EXPORT and INVALID_CLASS_NAME stay internal-error (no evidence to flip).
b. No real `-xml2swf` broken-frame SWF goes through the CLI (the text of task 26.2 names `test/unit/brokenFrame.test.ts`; stage fakes cover the path).
c. Property 26 does not cover the Emit registry or the Player (unit tests do).
d. The hover and double-event owner decisions of Checkpoint 3 are unchanged.
e. A `damaged` refusal from Convert writes no Failure_Log, so the cause (frame, depth, id) is lost; consider a log.
f. The web side numbers in `docs/outcome.md` describe wip/ui and are not on this branch.
g. papaspizzeria refuses at Facts yet took 23 s in the reviewer's run (the helper's run: 2 s); cause unknown, machine noise suspected.
h. Earlier checkpoints' items are still open.

## Not run or verified by the reviewer
Credits_Line (the owner reads the meter; it is not available to the agent, so the total credits of Block D are not stated); swf-inspector ("Not connected", FFDec used directly); a real broken-frame SWF through the CLI; Ruffle duplicate-character-id tolerance; the Ruffle lookup-failure fallback (read, not measured); papaspizzeria's 23 s; stray java and Chromium processes added timing noise.
