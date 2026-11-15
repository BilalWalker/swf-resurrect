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
