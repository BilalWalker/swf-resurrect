// Core: no node:* import. SHA-256 goes through globalThis.crypto.subtle (deterministic, not a node module).
// Fetched sample support (Requirement 20, design section 16).
export const STATIC_TEXT_SOURCE = {
  repo: 'ruffle-rs/ruffle',
  commit: '4a8d39661ed8aec97afee1504a4e33080da2efd0',
  repoPath: 'tests/tests/swfs/avm2/static_text/test.swf',
  sha256: 'b16194d9913a94b90a733841e8f19cd72fae38e223bc92e5e1040c368f33997e',
  targetPath: '.work/samples/static_text/test.swf',
} as const;

/** https://raw.githubusercontent.com/<repo>/<commit>/<repoPath> */
export function candidateUrl(repo: string, commit: string, repoPath: string): string {
  return `https://raw.githubusercontent.com/${repo}/${commit}/${repoPath}`;
}

export const SPACER_SOURCE = {
  repo: 'Zabuzard/Spacer',
  commit: '2c7326cd1ab68f2122f5e15405ec5b689633b882',
  repoPath: 'Spacer.swf',
  url: 'https://github.com/Zabuzard/Spacer/releases/download/v1/Spacer.swf',
  sha256: '368926f94eb4de93918df9d06655ea2a4dd0ff28a06df725e61751c92552a50a',
  targetPath: '.work/samples/spacer/test.swf',
} as const;

export type Sha256Check = { ok: true } | { ok: false; actual: string; expected: string };

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer so a view onto a larger or shared buffer hashes only its own bytes.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy));
  let out = '';
  for (const b of digest) out += (b < 16 ? '0' : '') + b.toString(16);
  return out;
}

/** The expected value is compared case-insensitively; both values in a mismatch are lower case. */
export async function verifySha256(bytes: Uint8Array, expectedHex: string): Promise<Sha256Check> {
  const actual = await sha256Hex(bytes);
  const expected = expectedHex.toLowerCase();
  return actual === expected ? { ok: true } : { ok: false, actual, expected };
}

export type FloorDecision =
  | { action: 'run' }
  | { action: 'skip'; message: string }
  | { action: 'fail'; message: string };

/** present=false -> skip naming `npm run fetch:static-text`; present with another hash -> fail naming both values. */
export function decideFloorTest(file: { present: boolean; sha256: string | null }, expectedHex: string): FloorDecision {
  const expected = expectedHex.toLowerCase();
  if (!file.present) {
    return {
      action: 'skip',
      message: `static_text test.swf is not present; run \`npm run fetch:static-text\` to fetch it`,
    };
  }
  const actual = file.sha256 === null ? null : file.sha256.toLowerCase();
  if (actual === expected) return { action: 'run' };
  return {
    action: 'fail',
    message: `static_text test.swf has another SHA-256: expected ${expected}, actual ${actual ?? 'unknown'}`,
  };
}

export type SampleDirKind = 'committed' | 'fetched' | 'invalid';

/** A directory with test.swf is committed; one with PROVENANCE.md and no .swf is fetched; anything else is invalid. */
export function classifySampleDir(entries: readonly string[]): SampleDirKind {
  if (entries.includes('test.swf')) return 'committed';
  const hasSwf = entries.some((e) => e.toLowerCase().endsWith('.swf'));
  if (entries.includes('PROVENANCE.md') && !hasSwf) return 'fetched';
  return 'invalid';
}

// Fetch core. Every effect goes through `FetchDeps`; the node edge is in scripts/.
export interface FetchDeps {
  fetchBytes(url: string): Promise<Uint8Array>; // rejects on non-2xx
  readLocal(path: string): Promise<Uint8Array>; // rejects when the path is unreadable
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
  /** A stable download URL; when absent the pinned raw URL is built from repo, commit and repoPath. */
  readonly url?: string;
  readonly sha256: string;
  readonly targetPath: string;
}

export type FetchOutcome =
  | 'fetched'
  | 'already-present'
  | 'sha-mismatch'
  | 'download-failed'
  | 'local-unreadable'
  | 'path-required';

export interface FetchOptions {
  /** A local copy to use instead of a download. */
  readonly localPath?: string;
  /** When set, no localPath is given and the source has no download URL: fail with `path-required` and this message. */
  readonly requirePathMessage?: string;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '.' : path.slice(0, i);
}

/** Writes `<target>.part` and renames it only after the SHA-256 matches. A mismatch writes nothing. */
export async function fetchSample(
  deps: FetchDeps,
  source: FetchSource,
  options: FetchOptions = {},
): Promise<FetchOutcome> {
  const target = source.targetPath;
  const part = `${target}.part`;
  const existing = await deps.readFileIfPresent(target);
  if (existing !== null && (await verifySha256(existing, source.sha256)).ok) {
    deps.out(`already present: ${target}`);
    return 'already-present';
  }
  let origin: string;
  let bytes: Uint8Array;
  if (options.localPath !== undefined) {
    origin = options.localPath;
    try {
      bytes = await deps.readLocal(origin);
    } catch (e) {
      deps.err(`cannot read local file ${origin}: ${e instanceof Error ? e.message : String(e)}`);
      return 'local-unreadable';
    }
  } else if (source.url === undefined && options.requirePathMessage !== undefined) {
    deps.err(options.requirePathMessage);
    return 'path-required';
  } else {
    origin = source.url ?? candidateUrl(source.repo, source.commit, source.repoPath);
    try {
      bytes = await deps.fetchBytes(origin);
    } catch (e) {
      await deps.removeFile(part);
      deps.err(`download failed: ${origin}: ${e instanceof Error ? e.message : String(e)}`);
      return 'download-failed';
    }
  }
  const check = await verifySha256(bytes, source.sha256);
  if (!check.ok) {
    await deps.removeFile(part);
    deps.err(`SHA-256 mismatch for ${origin}`);
    deps.err(`expected ${check.expected}`);
    deps.err(`actual   ${check.actual}`);
    return 'sha-mismatch';
  }
  await deps.mkdirp(parentOf(target));
  await deps.writeFile(part, bytes);
  await deps.rename(part, target);
  deps.out(`${options.localPath !== undefined ? 'copied' : 'fetched'}: ${target}`);
  return 'fetched';
}
