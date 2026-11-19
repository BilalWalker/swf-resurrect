/**
 * Outcome_File (robustness spec, D-A8, D-A10): `outcome.json`, canonical JSON, formatVersion 1.
 * The serialiser and the parser are pure. The write function takes an injected `fs`, so this file
 * imports no node:* module. `stages[].durationMs` is the only time-dependent field.
 */
import { canonicalJson } from "../pipeline/canonicalJson";
import type { OutcomeRecord } from "./outcome";
import { scrub } from "./reasons";

export const OUTCOME_FILE_NAME = "outcome.json";
export const OUTCOME_FORMAT_VERSION = 1;

const OUTCOME_CODES = ["converted", "converted-with-gaps", "refused", "failed"];

export class OutcomeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeFileError";
  }
}

/** Copy of the record with every free-text field scrubbed (reason, gap examples, stage names). */
export function scrubRecord(record: OutcomeRecord): OutcomeRecord {
  return {
    ...record,
    reason: scrub(record.reason),
    facts: record.facts
      ? {
          ...record.facts,
          source: {
            header: record.facts.source.header.map((l) => scrub(l)).filter((l) => l !== ""),
            ffdec: record.facts.source.ffdec.map((l) => scrub(l)).filter((l) => l !== ""),
          },
        }
      : record.facts,
    gaps: record.gaps.map((g) => ({ ...g, examples: g.examples.map((e) => scrub(e)).filter((e) => e !== "") })),
    stages: record.stages.map((s) => ({ ...s, name: scrub(s.name) as typeof s.name })),
  };
}

/** Canonical text of the record: sorted keys, two-space indent, one trailing newline. */
export function serialiseOutcome(record: OutcomeRecord): string {
  return canonicalJson(scrubRecord(record), "outcome");
}

/** Parse an Outcome_File. Rejects any formatVersion other than 1 with a message naming it. */
export function parseOutcome(text: string): OutcomeRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OutcomeFileError("outcome file is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutcomeFileError("outcome file is not a JSON object");
  }
  const rec = value as Record<string, unknown>;
  if (rec.formatVersion !== OUTCOME_FORMAT_VERSION) {
    throw new OutcomeFileError(
      `unsupported outcome formatVersion ${scrub(JSON.stringify(rec.formatVersion) ?? "undefined")}, expected ${OUTCOME_FORMAT_VERSION}`,
    );
  }
  if (typeof rec.outcome !== "string" || !OUTCOME_CODES.includes(rec.outcome)) {
    throw new OutcomeFileError("outcome file has an unknown outcome code");
  }
  if (!Array.isArray(rec.gaps) || !Array.isArray(rec.stages)) {
    throw new OutcomeFileError("outcome file lacks gaps or stages");
  }
  // `numbers: null` (refusal before Translate), `obfuscated: null` and `recovery: null` are valid.
  // An Outcome_File from before D-E1 has no class totals: read it as one that holds no total.
  const nums = rec.numbers;
  if (typeof nums === "object" && nums !== null && !Array.isArray(nums)) {
    const n = nums as Record<string, unknown>;
    if (n.consideredClasses === undefined) n.consideredClasses = n.candidateClasses;
    if (n.totalClasses === undefined) n.totalClasses = null;
    if (n.notConsideredClasses === undefined) n.notConsideredClasses = null;
  }
  return rec as unknown as OutcomeRecord;
}

/** The part of `fs` the writer uses. */
export interface OutcomeFs {
  writeFile(path: string, text: string): void | Promise<void>;
  rename(from: string, to: string): void | Promise<void>;
  /** Best-effort removal of the temporary file after a failure. */
  remove?(path: string): void | Promise<void>;
}

export interface OutcomeWriteResult {
  /** false when the directory is not writable; the caller still prints the Outcome_Line. */
  written: boolean;
  path: string | null;
}

/**
 * Write `outcome.json.tmp-<pid>` in `dir`, then rename it to `outcome.json`, so a reader never
 * sees a partial file. Never throws: an I/O failure returns `written: false`.
 */
export async function writeOutcomeFile(
  dir: string,
  record: OutcomeRecord,
  fs: OutcomeFs,
  pid: number,
): Promise<OutcomeWriteResult> {
  const base = dir.endsWith("/") || dir.endsWith("\\") ? dir : `${dir}/`;
  const final = `${base}${OUTCOME_FILE_NAME}`;
  const tmp = `${final}.tmp-${pid}`;
  try {
    await fs.writeFile(tmp, serialiseOutcome(record));
    await fs.rename(tmp, final);
    return { written: true, path: final };
  } catch {
    try {
      await fs.remove?.(tmp);
    } catch {
      // ignore: nothing more can be done
    }
    return { written: false, path: null };
  }
}
