// Spec task 2.2 (Requirement 28.7): test-side helpers for the Fetched_Sample `spacer`.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe } from "vitest";
import { fileURLToPath } from "node:url";
import { SPACER_SOURCE } from "../../src/samples/fetchedSample";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Absolute path of the fetched file (`.work/samples/spacer/test.swf`). */
export function spacerSwfPath(): string {
  return join(root, ...SPACER_SOURCE.targetPath.split("/"));
}

export const SPACER_SKIP_MESSAGE = "spacer test.swf is not present; run `npm run fetch:spacer` to fetch it";

/** The suite title: unchanged when the file is present, naming `npm run fetch:spacer` when it is absent. */
export function spacerSuiteTitle(name: string, path: string = spacerSwfPath()): string {
  return existsSync(path) ? name : `${name} (skipped: ${SPACER_SKIP_MESSAGE})`;
}

/** Like `describe`, but skipped, with the title naming `npm run fetch:spacer`, when the SWF is absent. */
export function describeIfSpacer(name: string, fn: () => void, path: string = spacerSwfPath()): void {
  if (existsSync(path)) describe(name, fn);
  else describe.skip(spacerSuiteTitle(name, path), fn);
}
