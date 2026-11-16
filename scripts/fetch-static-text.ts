// Edge: fetches the static_text sample into .work/ (never committed, Requirement 20).
// Run with `npm run fetch:static-text`. Exit codes: 0 fetched or already present, 1 SHA-256 mismatch, 2 download failed.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  STATIC_TEXT_SOURCE,
  fetchSample,
  type FetchDeps,
  type FetchOutcome,
  type FetchSource,
} from '../src/samples/fetchedSample';

export { fetchSample, type FetchDeps, type FetchOutcome, type FetchSource } from '../src/samples/fetchedSample';

/** Kept under its old name; the `static_text` sample is unchanged. */
export function fetchStaticText(deps: FetchDeps, source: FetchSource = STATIC_TEXT_SOURCE): Promise<FetchOutcome> {
  return fetchSample(deps, source);
}
export const realDeps: FetchDeps = {
  readLocal: (path) => readFile(path).then((b) => new Uint8Array(b)),
  async fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  },
  writeFile: (path, bytes) => writeFile(path, bytes),
  rename: (from, to) => rename(from, to),
  removeFile: (path) => rm(path, { force: true }),
  async readFileIfPresent(path) {
    try {
      return new Uint8Array(await readFile(path));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  },
  mkdirp: async (path) => {
    await mkdir(path, { recursive: true });
  },
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export async function main(_argv: string[]): Promise<number> {
  const outcome = await fetchStaticText(realDeps);
  if (outcome === 'sha-mismatch') return 1;
  if (outcome === 'download-failed') return 2;
  return 0;
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
