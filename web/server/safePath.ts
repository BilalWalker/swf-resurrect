// Maps a URL path tail onto a file inside one root directory, or refuses. Pure: no fs.
// Every static route of the server goes through resolveInside, so a request can never name a
// file outside the job (or vendor) directory it is meant for.
import { isAbsolute, posix, resolve, sep } from 'node:path';

export type SafePath = { ok: true; path: string; relative: string } | { ok: false; reason: string };

/**
 * `tail` is the raw (still percent-encoded) part of the URL after the route prefix, without the
 * query string. Refused: bad percent-encoding, NUL, backslashes, drive letters, absolute paths,
 * `.` / `..` / empty segments (after decoding, so `%2e%2e` counts), and anything that resolves
 * outside `root`. An empty tail resolves to `fallback` when given.
 */
export function resolveInside(root: string, tail: string, fallback?: string): SafePath {
  let decoded: string;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    return { ok: false, reason: 'bad percent-encoding' };
  }
  if (decoded === '' && fallback !== undefined) decoded = fallback;
  if (decoded === '') return { ok: false, reason: 'empty path' };
  if (decoded.includes('\0')) return { ok: false, reason: 'NUL in path' };
  if (decoded.includes('\\')) return { ok: false, reason: 'backslash in path' };
  if (decoded.includes(':')) return { ok: false, reason: 'colon in path' };
  if (decoded.startsWith('/') || isAbsolute(decoded)) return { ok: false, reason: 'absolute path' };
  const segments = decoded.split('/');
  for (const s of segments) {
    if (s === '' || s === '.' || s === '..') return { ok: false, reason: 'bad path segment' };
  }
  const base = resolve(root);
  const full = resolve(base, ...segments);
  if (!full.startsWith(base + sep)) return { ok: false, reason: 'outside root' };
  return { ok: true, path: full, relative: posix.join(...segments) };
}
