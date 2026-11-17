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
| `obfuscated` | Detection result, or `null` when detection did not run. |
| `recovery` | The recovery record, or `null` when no recovery was tried. |
| `referenceId` | Eight hex digits, only for `failed`; otherwise `null`. |

Notes:

- `numbers` is `null` for a refusal before Translate ran, so a reader must not assume the counts exist.
- Class counts (amended at Task 12.3): a class counts as translated when Emit registered it (not omitted, so its file parses) and it is clean, loose or kept with untranslated code. `cleanClasses + looseClasses + untranslatedCodeClasses` plus the omitted candidates equals `candidateClasses` (`omittedClasses` also counts an omitted linked class that is not a candidate, so it can be larger), and `translatedClasses` is the first three. `untranslatedCodeClasses` is registered classes with report status `unsupported` that are not loose. `unsupportedClasses` is every candidate with report status `unsupported`, registered or omitted; it overlaps the other fields and is not part of the sum.
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
    "translatedClasses": 6,
    "typeErrors": 0,
    "unsupportedClasses": 0,
    "untranslatedCodeClasses": 0
  },
  "obfuscated": null,
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
    "translatedClasses": 5,
    "typeErrors": 2,
    "unsupportedClasses": 1,
    "untranslatedCodeClasses": 1
  },
  "obfuscated": null,
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
  "obfuscated": null,
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
