# Outcome and Outcome_File

Every pipeline run ends in exactly one of four outcomes. The run prints one Outcome_Line and writes
`outcome.json` (the Outcome_File, `formatVersion` 1) in the output directory. The file is written to
`outcome.json.tmp-<pid>` and renamed, so a reader never sees a partial file. It is canonical JSON: sorted keys,
two-space indent, one trailing newline. `stages[].durationMs` is the only time-dependent field.

The code is in `src/outcome/` (`outcome.ts`, `outcomeFile.ts`, `exitCode.ts`, `reasons.ts`, `gaps.ts`).

## The four outcomes

| Outcome | Meaning | Reason_Code |
|---|---|---|
| `converted` | A project was emitted with no gap and no type error. | null |
| `converted-with-gaps` | A project was emitted and at least one gap or type error is listed. There is no percentage threshold. | null |
| `refused` | The input is not something the tool converts. No project is emitted. | one of the refusal codes below |
| `failed` | The tool itself broke. The Reference_Id names the log. | `internal-error` |

`reasonCode` is null if and only if the outcome is `converted` or `converted-with-gaps`.

## Reason_Codes

| Code | Sentence |
|---|---|
| `not-swf` | The file is not a SWF. |
| `damaged` | The file could not be read. |
| `actionscript-1-2` | The file uses ActionScript 1 or 2, which is not supported. |
| `encrypted` | The file is encrypted. |
| `too-large` | The file is larger than the size limit. |
| `time-limit` | A stage or the whole run reached its time limit. |
| `nothing-translated` | There are candidate classes and none could be translated. |
| `internal-error` | An internal error stopped the run. |

`encrypted` is defined and tested through `decideOutcome`, but the pipeline does not yet detect an encrypted file in a real run, so no real run ends with it.

## Exit codes

| Exit code | Outcome |
|---|---|
| 0 | `converted` |
| 0 | `converted-with-gaps` |
| 1 | `failed` |
| 2 | usage or path error |
| 3 | `refused` |

## Outcome_File fields

| Field | Content |
|---|---|
| `formatVersion` | Always 1. The parser rejects any other version and names it. |
| `outcome` | One of the four outcomes. |
| `reasonCode` | See above. |
| `reason` | One scrubbed line of at most 200 characters: no drive or root path, stack line, environment variable name or FFDec text. |
| `facts` | Header facts read before any stage runs (signature, version, compression, sizes, stage size, frame rate, declared frames, `scriptVersion`, `abcClassCount`, `source`). `null` only if the Facts_Reader did not run. The `source` lines are scrubbed like `reason`. |
| `numbers` | Class and error counts from the Translation_Report. `null` for a refusal before Translate ran. |
| `gaps` | One entry per gap kind: `kind`, `count` and at most 5 `examples`. |
| `limits` | The size, run and stage limits and the stage weights that applied. |
| `stages` | Each stage that ran: `name`, `result` (`ok`, `error`, `skipped`) and `durationMs`. |
| `obfuscated` | Detection result `{ detected, invalidNames, namesScanned, sourceSignals }`, or `null` when detection did not run (a refusal before the scan, a file whose body is not read such as `ZWS`). `detected` is true when at least 20 % of the multiname names read from the ABC constant pools are not legal identifiers and at least 5 are invalid. The 20 % and the 5 are chosen, not measured against a population (Open_Item O2). A file with no ABC tag, or a pool that could not be read to its end, gives `detected: false` with the counts read. `sourceSignals` is `null` unless the recovered copy was unpacked; then it is the number of classes that still hold `§§push` or `§§pop`. |
| `recovery` | The recovery record, or `null` when no recovery was tried (a file that is not obfuscated never gets one). Fields: `attempted`; `skipped` (`copy-failed`, `not-obfuscated` or `null`); `failedStep` (`copy`, `rename`, `deobfuscate` or `null`); `fallback` (true when the original was translated after a failed recovery); `renamedIdentifiers` (invalid names of the original scan minus invalid names of the renamed copy, clamped at 0, and 0 when the renamed copy cannot be scanned); `deobfuscated`; `candidateClasses` (the Translation_Report candidates); `recoveredClasses` (the translated classes of the recovered copy, 0 after a fallback); `unrecoverableClasses` (Candidate_Classes of the Translation_Report whose source still holds `§§push` or `§§pop`; the same number is `obfuscated.sourceSignals`). See "Recovered runs" below. |
| `referenceId` | Eight hex digits, only for `failed`; otherwise `null`. |
| `embeddedSwfs` | Present only when the file holds at least one embedded SWF: `{ count, totalBytes, largestBytes }` (sizes in bytes). Absent otherwise; a file without it is valid and means none. See "Wrapper files" below. |

Wrapper files:
- A SWF with a `DefineBinaryData` tag whose data starts with `FWS`, `CWS` or `ZWS` (a loader that holds the real movie) is a wrapper. The inner file is not converted yet, so the outcome is `converted-with-gaps`, never plain `converted`, with one gap of kind `embedded-swf`: `count` is the number of embedded SWFs and `examples` (at most 5) hold only id, signature, version and size, for example `id 46: CWS v10, 7349081 bytes`.
- The `reason` starts (after a recovery prefix, if any) `the file is a wrapper around another SWF that was not converted (N embedded, X MiB); ` and then gives the usual class counts, so the class count of the wrapper itself is not the lead. When the sentence would pass 200 characters, the gap part is dropped first, then the size, then the wrapper statement (the gap and the field remain). Example field: `"embeddedSwfs": {"count":1,"largestBytes":7349081,"totalBytes":7349081}`.
Recovered runs:

- An obfuscated file is copied, renamed and deobfuscated by FFDec in the work directory; Unpack, Convert and Translate read the copy and the input file is never changed. The `reason` of such a run starts `obfuscated: names renamed, N of M classes recovered` (N is `recovery.recoveredClasses`, M is `recovery.candidateClasses`); with gaps it continues `; <the usual gap sentence>`. It says the result was recovered and does not claim an improvement: no baseline of the original is measured.
- Each Candidate_Class (a class of the Translation_Report; helper sources that are no candidate are not counted) that still holds `§§push` or `§§pop` after deobfuscation is an `unrecoverable-class` entry in `unsupported-features.json` ("the decompiled source is not readable after deobfuscation") and counts as a gap. A translated recovered copy also lists the Named_Limit `obfuscation-recovered` (class names were rewritten by FFDec and may differ from the original names); a Named_Limit is not a gap.
- After a failed recovery the original is translated (`fallback: true`, `failedStep` names the step) and the reason is the ordinary sentence. Example `recovery` object of a recovered run: `{"attempted":true,"candidateClasses":12,"deobfuscated":true,"failedStep":null,"fallback":false,"recoveredClasses":9,"renamedIdentifiers":41,"skipped":null,"unrecoverableClasses":2}`.

Notes:

- `numbers` is `null` for a refusal before Translate ran, so a reader must not assume the counts exist.
- Class counts (amended at Task 12.3): a class counts as translated when Emit registered it (not omitted) and its emitted file parses, and it is clean, loose or kept with untranslated code. A class whose translated output does not parse (the D5 fallback, marked `parseFailed` in the Translation_Report) never counts: `unparsedClasses` holds those apart. `cleanClasses + looseClasses + untranslatedCodeClasses + unparsedClasses` plus the omitted candidates equals `candidateClasses` (`omittedClasses` also counts an omitted linked class that is not a candidate, so it can be larger), and `translatedClasses` is the first three. `untranslatedCodeClasses` is registered classes with report status `unsupported` that are not loose. `unsupportedClasses` is every candidate with report status `unsupported`, registered or omitted; it overlaps the other fields and is not part of the sum.
- `stubDependentClasses` (robustness task 16.2) is the number of registered classes whose Shim import line names a `stub` class of the Flash_API_Table (`Sound`, `URLLoader`, ...): their type check depends on a stub, and the game sees neutral values from it. It overlaps the class counts above. A pure scan of the translated imports; it does not say the stub was called (the Fidelity_Report lists the stubs the Replay observed).
- `facts.abcClassCount` is the number of exported `.as` files. It can differ by one from the class count of
  `swf_summary` (seen on `redball4`; Open_Item O14).
- The default run limit is 300 s. The web server kills a job after 180 s (`web/server/options.ts`), which is
  shorter. The web owner must align the two; this repository does not edit `web/` (Requirement 6.3).

### Run_Limits

`src/pipeline/limits.ts` resolves each limit as option, then environment variable, then default. A value that is
not a positive integer (text, zero, negative, decimal) is a usage error and exits 2.

| Limit | Option | Variable | Default | Reason |
|---|---|---|---|---|
| Input size | `--max-size <MiB>` | `SWF_RESURRECT_MAX_SIZE_MIB` | 20 MiB | Equals the upload limit of `web/server/upload.ts`, so the CLI and the web app refuse the same files. |
| Run | `--run-limit <seconds>` | `SWF_RESURRECT_RUN_LIMIT_S` | 300 s | Five minutes for the whole run: the stage allowances above add up to 540 s, so the run limit is the tighter bound. It exceeds the web server's 180 s kill, so the server ends a job first; the web owner aligns the two. |
| Stage base | `--stage-limit <seconds>` | `SWF_RESURRECT_STAGE_LIMIT_S` | 60 s | One unit of stage time. A stage may use the base times its weight. |

Stage weights: `recover` 2, `unpack` 2, `convert` 1, `translate` 1, `emit` 1, `gate` 1, `verify` 3. With the
default base, `recover` and `unpack` get 120 s each, `verify` 180 s and the others 60 s. Unpack and recover start
FFDec (a Java process, slow to start and to decompile large files), and verify renders frames in a browser, so
these three get more than the base. The limits that applied are written to `limits` in the Outcome_File.

## Examples

One record per outcome, as the writer prints it. `test/unit/outcomeDocs.test.ts` compares each block with the
writer's output.

### converted

```json
{
  "facts": {
    "abcClassCount": 6,
    "compression": "zlib",
    "declaredFrames": 1,
    "declaredLength": 90112,
    "frameRate": 24,
    "scriptVersion": "as3",
    "signature": "CWS",
    "sizeBytes": 48213,
    "source": {
      "ffdec": [],
      "header": []
    },
    "stage": {
      "height": 400,
      "width": 550
    },
    "version": 10
  },
  "formatVersion": 1,
  "gaps": [],
  "limits": {
    "maxSizeMiB": 20,
    "runLimitS": 300,
    "stageLimitS": 60,
    "stageWeights": {
      "convert": 1,
      "emit": 1,
      "gate": 1,
      "recover": 2,
      "translate": 1,
      "unpack": 2,
      "verify": 3
    }
  },
  "numbers": {
    "candidateClasses": 6,
    "cleanClasses": 6,
    "droppedPlacements": 0,
    "looseClasses": 0,
    "namedLimits": 0,
    "omittedClasses": 0,
    "stubDependentClasses": 0,
    "translatedClasses": 6,
    "typeErrors": 0,
    "unparsedClasses": 0,
    "unsupportedClasses": 0,
    "untranslatedCodeClasses": 0
  },
  "obfuscated": {
    "detected": false,
    "invalidNames": 0,
    "namesScanned": 97,
    "sourceSignals": null
  },
  "outcome": "converted",
  "reason": "6 of 6 classes translated",
  "reasonCode": null,
  "recovery": null,
  "referenceId": null,
  "stages": [
    {
      "durationMs": 120,
      "name": "unpack",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "convert",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "translate",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "emit",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "gate",
      "result": "ok"
    }
  ]
}
```

### converted-with-gaps

```json
{
  "facts": {
    "abcClassCount": 6,
    "compression": "zlib",
    "declaredFrames": 1,
    "declaredLength": 90112,
    "frameRate": 24,
    "scriptVersion": "as3",
    "signature": "CWS",
    "sizeBytes": 48213,
    "source": {
      "ffdec": [],
      "header": []
    },
    "stage": {
      "height": 400,
      "width": 550
    },
    "version": 10
  },
  "formatVersion": 1,
  "gaps": [
    {
      "count": 2,
      "examples": [
        "Game.as(41): Property 'hitTest' does not exist"
      ],
      "kind": "type-error"
    },
    {
      "count": 1,
      "examples": [
        "Spawner"
      ],
      "kind": "untranslated-class"
    }
  ],
  "limits": {
    "maxSizeMiB": 20,
    "runLimitS": 300,
    "stageLimitS": 60,
    "stageWeights": {
      "convert": 1,
      "emit": 1,
      "gate": 1,
      "recover": 2,
      "translate": 1,
      "unpack": 2,
      "verify": 3
    }
  },
  "numbers": {
    "candidateClasses": 6,
    "cleanClasses": 3,
    "droppedPlacements": 0,
    "looseClasses": 1,
    "namedLimits": 1,
    "omittedClasses": 1,
    "stubDependentClasses": 1,
    "translatedClasses": 5,
    "typeErrors": 2,
    "unparsedClasses": 0,
    "unsupportedClasses": 1,
    "untranslatedCodeClasses": 1
  },
  "obfuscated": {
    "detected": false,
    "invalidNames": 0,
    "namesScanned": 97,
    "sourceSignals": null
  },
  "outcome": "converted-with-gaps",
  "reason": "5 of 6 classes translated (1 with untranslated code), 2 type errors; most gaps: type-error (2), untranslated-class (1)",
  "reasonCode": null,
  "recovery": null,
  "referenceId": null,
  "stages": [
    {
      "durationMs": 120,
      "name": "unpack",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "convert",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "translate",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "emit",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "gate",
      "result": "ok"
    }
  ]
}
```

### refused

```json
{
  "facts": {
    "abcClassCount": null,
    "compression": "zlib",
    "declaredFrames": 1,
    "declaredLength": 90112,
    "frameRate": 24,
    "scriptVersion": "as1-2",
    "signature": "CWS",
    "sizeBytes": 48213,
    "source": {
      "ffdec": [],
      "header": []
    },
    "stage": {
      "height": 400,
      "width": 550
    },
    "version": 10
  },
  "formatVersion": 1,
  "gaps": [],
  "limits": {
    "maxSizeMiB": 20,
    "runLimitS": 300,
    "stageLimitS": 60,
    "stageWeights": {
      "convert": 1,
      "emit": 1,
      "gate": 1,
      "recover": 2,
      "translate": 1,
      "unpack": 2,
      "verify": 3
    }
  },
  "numbers": null,
  "obfuscated": null,
  "outcome": "refused",
  "reason": "the file uses ActionScript 1 or 2, which is not supported",
  "reasonCode": "actionscript-1-2",
  "recovery": null,
  "referenceId": null,
  "stages": []
}
```

### failed

```json
{
  "facts": {
    "abcClassCount": 6,
    "compression": "zlib",
    "declaredFrames": 1,
    "declaredLength": 90112,
    "frameRate": 24,
    "scriptVersion": "as3",
    "signature": "CWS",
    "sizeBytes": 48213,
    "source": {
      "ffdec": [],
      "header": []
    },
    "stage": {
      "height": 400,
      "width": 550
    },
    "version": 10
  },
  "formatVersion": 1,
  "gaps": [],
  "limits": {
    "maxSizeMiB": 20,
    "runLimitS": 300,
    "stageLimitS": 60,
    "stageWeights": {
      "convert": 1,
      "emit": 1,
      "gate": 1,
      "recover": 2,
      "translate": 1,
      "unpack": 2,
      "verify": 3
    }
  },
  "numbers": null,
  "obfuscated": {
    "detected": false,
    "invalidNames": 0,
    "namesScanned": 97,
    "sourceSignals": null
  },
  "outcome": "failed",
  "reason": "an internal error stopped the run",
  "reasonCode": "internal-error",
  "recovery": null,
  "referenceId": "3fa9c01e",
  "stages": [
    {
      "durationMs": 120,
      "name": "unpack",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "convert",
      "result": "ok"
    },
    {
      "durationMs": 120,
      "name": "translate",
      "result": "error"
    }
  ]
}
```

## Local files (on request)

The default suite never reads `.work/judge-test/`. To run the local, uncommitted files (empty, text, truncated, redball4) through the CLI, use `npm run test:local-files` (it sets `SWF_RESURRECT_LOCAL_FILES=1` and runs `test/e2e/localFiles.e2e.test.ts`). Every file found is reported with the same fields: Outcome, reason code, exit code, class numbers, gap kinds and counts, and stage durations, written to `.work/robustness-local/summary.md`. A file that is absent is skipped with a message. `redball4` takes about 90 s of CPU, so allow for that.

