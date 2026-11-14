// Pure: path rules of the inspector. Every path an agent passes must stay inside the repository.
import path from 'node:path';

/** The part of node:path used here; path.win32 and path.posix fit, so both platforms can be tested. */
export type PathApi = Pick<typeof path, 'resolve' | 'relative' | 'isAbsolute' | 'sep'>;

export class OutsideRepoError extends Error {
  constructor(given: string) {
    super(`path is outside the repository: ${given}`);
  }
}

/** Absolute path of `given` (relative paths are taken from the repo root); throws when it leaves the repo. */
export function resolveInsideRepo(repoRoot: string, given: string, p: PathApi = path): string {
  if (given.includes('\0')) throw new OutsideRepoError(given);
  const root = p.resolve(repoRoot);
  const full = p.resolve(root, given);
  const rel = p.relative(root, full);
  if (rel === '' || rel.startsWith('..') || p.isAbsolute(rel)) {
    if (rel === '') return full;
    throw new OutsideRepoError(given);
  }
  return full;
}

/** Repo-relative path with forward slashes, for display. */
export function displayPath(repoRoot: string, full: string, p: PathApi = path): string {
  return p.relative(p.resolve(repoRoot), full).split(p.sep).join('/');
}
