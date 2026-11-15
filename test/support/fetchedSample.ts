// Spec task 17.10 (Requirement 20.3, 20.4, 20.9). Test-side helpers for the Fetched_Sample `static_text`.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_TEXT_SOURCE, decideFloorTest, type FloorDecision } from "../../src/samples/fetchedSample";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Absolute path of the fetched file (`.work/samples/static_text/test.swf`). */
export const STATIC_TEXT_PATH = join(root, ...STATIC_TEXT_SOURCE.targetPath.split("/"));

/**
 * Reads the file synchronously, so that the result can feed `describe.skipIf` at collection time.
 * The hash is computed with node:crypto here (the Core `sha256Hex` is async); test/support is not Core.
 */
export function staticTextDecision(path: string = STATIC_TEXT_PATH): FloorDecision {
  if (!existsSync(path)) return decideFloorTest({ present: false, sha256: null }, STATIC_TEXT_SOURCE.sha256);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  return decideFloorTest({ present: true, sha256 }, STATIC_TEXT_SOURCE.sha256);
}

/** For a suite: `describe.skipIf(d.action === 'skip')(suiteTitle(name, d), ...)`. */
export function suiteTitle(name: string, decision: FloorDecision): string {
  return decision.action === "skip" ? `${name} (skipped: ${decision.message})` : name;
}

/** In the first test of a suite: throws the message (both SHA-256 values) when the decision is `fail`. */
export function assertNotFailed(decision: FloorDecision): void {
  if (decision.action === "fail") throw new Error(decision.message);
}

/** Rows that the note of a Fetched_Sample carries beyond the common fields (Requirement 20.4). */
export const FETCHED_NOTE_ROWS = ["Not in the Repository", "Fetch command", "Target path", "Embedded fonts"] as const;

export function validateFetchedNoteRows(text: string): string[] {
  const problems: string[] = [];
  for (const row of FETCHED_NOTE_ROWS) {
    const re = new RegExp(`^\\|\\s*${row}\\s*\\|\\s*\\S`, "m");
    if (!re.test(text)) problems.push(`the row "${row}" is missing or empty`);
  }
  return problems;
}
