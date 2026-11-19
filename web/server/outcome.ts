// Reads the pipeline's Outcome_File (`outcome.json`, docs/outcome.md) after the process ends and
// keeps the part the result page shows. The parser is the engine's own (src/outcome/outcomeFile.ts).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUTCOME_FILE_NAME, parseOutcome } from '../../src/outcome/outcomeFile';
import type { Facts, GapSummary, OutcomeCode, OutcomeNumbers, OutcomeRecord, ReasonCode } from '../../src/outcome/outcome';

export type { Facts as OutcomeFacts, GapKind, GapSummary, OutcomeCode, OutcomeNumbers, ReasonCode } from '../../src/outcome/outcome';

/** What the client gets of an Outcome_File. `numbers` and `facts` can be null; never assume them. */
export interface JobOutcome {
  outcome: OutcomeCode;
  reasonCode: ReasonCode | null;
  /** One scrubbed sentence written by the engine; shown as it is. */
  reason: string;
  numbers: OutcomeNumbers | null;
  gaps: GapSummary[];
  facts: Facts | null;
  /** Set when the file was found obfuscated; null when it was not, or detection did not run. */
  obfuscation: ObfuscationSummary | null;
  /** Eight hex digits, only for `failed`. */
  referenceId: string | null;
  /** The run limit that applied, in seconds; null when the file does not say. */
  runLimitS: number | null;
}

export interface ObfuscationSummary {
  /** Recovery ran and its result was translated (not a fallback to the original). */
  recovered: boolean;
  /** The original was translated after a failed recovery. */
  fallback: boolean;
  recoveredClasses: number | null;
  candidateClasses: number | null;
  unrecoverableClasses: number | null;
}

export type OutcomeRead = { ok: true; outcome: JobOutcome } | { ok: false; message: string };

export function toJobOutcome(r: OutcomeRecord): JobOutcome {
  const rec = r.recovery;
  const obfuscation: ObfuscationSummary | null =
    r.obfuscated?.detected === true
      ? {
          recovered: rec !== null && rec.attempted && rec.skipped === null && !rec.fallback,
          fallback: rec?.fallback === true,
          recoveredClasses: rec?.recoveredClasses ?? null,
          candidateClasses: rec?.candidateClasses ?? null,
          unrecoverableClasses: rec?.unrecoverableClasses ?? null,
        }
      : null;
  return {
    outcome: r.outcome,
    reasonCode: r.reasonCode ?? null,
    reason: typeof r.reason === 'string' ? r.reason : '',
    numbers: r.numbers ?? null,
    gaps: Array.isArray(r.gaps) ? r.gaps : [],
    facts: r.facts ?? null,
    obfuscation,
    referenceId: r.referenceId ?? null,
    runLimitS: typeof r.limits?.runLimitS === 'number' ? r.limits.runLimitS : null,
  };
}

/** Parses Outcome_File text. A file the engine's parser rejects is reported in one plain sentence. */
export function parseOutcomeText(text: string): OutcomeRead {
  try {
    return { ok: true, outcome: toJobOutcome(parseOutcome(text)) };
  } catch {
    return { ok: false, message: 'the converter ended, but its result record could not be read' };
  }
}

/** Reads `<outDir>/outcome.json`. Missing or unreadable: `ok: false` with a plain sentence. */
export async function readOutcomeFile(outDir: string): Promise<OutcomeRead> {
  let text: string;
  try {
    text = await readFile(join(outDir, OUTCOME_FILE_NAME), 'utf8');
  } catch {
    return { ok: false, message: 'the converter ended without writing its result record' };
  }
  return parseOutcomeText(text);
}
