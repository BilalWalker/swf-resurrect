// Edge: fetches or copies the spacer sample into .work/ (never committed, Requirement 28).
// `npm run fetch:spacer` downloads the upstream release asset; `npm run fetch:spacer -- <path>` copies a local file.
// Both check the SHA-256 first. Exit codes: 0 fetched or already present, 1 SHA-256 mismatch, 2 download failed
// (or no path given for a source without a download URL), 3 unreadable local path.
import { pathToFileURL } from 'node:url';
import { SPACER_SOURCE, fetchSample, type FetchDeps, type FetchOutcome, type FetchSource } from '../src/samples/fetchedSample';
import { realDeps } from './fetch-static-text';

export const PATH_REQUIRED_MESSAGE =
  'spacer has no download URL: pass the path of a local copy, e.g. `npm run fetch:spacer -- .work/games/spacer/test.swf`';

export function fetchSpacer(
  deps: FetchDeps,
  localPath?: string,
  source: FetchSource = SPACER_SOURCE,
): Promise<FetchOutcome> {
  return fetchSample(deps, source, { localPath, requirePathMessage: PATH_REQUIRED_MESSAGE });
}

export function exitCodeFor(outcome: FetchOutcome): number {
  switch (outcome) {
    case 'sha-mismatch':
      return 1;
    case 'download-failed':
    case 'path-required':
      return 2;
    case 'local-unreadable':
      return 3;
    default:
      return 0;
  }
}

export async function main(argv: string[]): Promise<number> {
  return exitCodeFor(await fetchSpacer(realDeps, argv[0]));
}

// Run only when started directly, so importing this module in a test has no effect.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 2;
    },
  );
}
