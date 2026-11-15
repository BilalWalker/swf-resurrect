// Edge: fetches the static_text sample into .work/ (never committed, Requirement 20).
// Run with `npm run fetch:static-text`. Exit codes: 0 fetched or already present, 1 SHA-256 mismatch, 2 download failed.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STATIC_TEXT_SOURCE, candidateUrl, verifySha256 } from '../src/samples/fetchedSample';

export interface FetchDeps {
  fetchBytes(url: string): Promise<Uint8Array>; // Node fetch; rejects on non-2xx
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  removeFile(path: string): Promise<void>; // ignores a missing file
  readFileIfPresent(path: string): Promise<Uint8Array | null>;
  mkdirp(path: string): Promise<void>;
  out(line: string): void;
  err(line: string): void;
}

export interface FetchSource {
  readonly repo: string;
  readonly commit: string;
  readonly repoPath: string;
  readonly sha256: string;
  readonly targetPath: string;
}

export type FetchOutcome = 'fetched' | 'already-present' | 'sha-mismatch' | 'download-failed';

export async function fetchStaticText(
  deps: FetchDeps,
  source: FetchSource = STATIC_TEXT_SOURCE,
): Promise<FetchOutcome> {
  const target = source.targetPath;
  const part = `${target}.part`;

  const existing = await deps.readFileIfPresent(target);
  if (existing !== null && (await verifySha256(existing, source.sha256)).ok) {
    deps.out(`already present: ${target}`);
    return 'already-present';
  }

  const url = candidateUrl(source.repo, source.commit, source.repoPath);
  let bytes: Uint8Array;
  try {
    bytes = await deps.fetchBytes(url);
  } catch (e) {
    await deps.removeFile(part);
    deps.err(`download failed: ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return 'download-failed';
  }

  const check = await verifySha256(bytes, source.sha256);
  if (!check.ok) {
    await deps.removeFile(part);
    deps.err(`SHA-256 mismatch for ${url}`);
    deps.err(`expected ${check.expected}`);
    deps.err(`actual   ${check.actual}`);
    return 'sha-mismatch';
  }

  await deps.mkdirp(dirname(target));
  await deps.writeFile(part, bytes);
  await deps.rename(part, target);
  deps.out(`fetched: ${target}`);
  return 'fetched';
}

const realDeps: FetchDeps = {
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
