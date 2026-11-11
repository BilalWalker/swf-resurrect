import { dirname, parse, relative, isAbsolute, resolve, sep } from 'node:path';
import type { ForceRefusalReason } from './errors';

export type ForceRefusal = ForceRefusalReason;

export interface ForceContext {
  cwd: string;
  homeDir: string;
  swfPath: string;
}

function norm(p: string): string {
  const r = resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

/** True when `a` equals `b` or is an ancestor of `b` (both already normalised). */
function isAncestorOrEqual(a: string, b: string): boolean {
  const rel = relative(a, b);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Pure string check. Returns the reason to refuse `--force` on `resolved`, or null if safe. */
export function checkForceTarget(resolved: string, ctx: ForceContext): ForceRefusal | null {
  const out = norm(resolved);
  if (parse(out).root === out) return 'filesystem-root';
  if (out === norm(ctx.homeDir)) return 'home-directory';
  const cwd = norm(ctx.cwd);
  if (out === cwd) return 'current-directory';
  if (isAncestorOrEqual(out, cwd)) return 'ancestor-of-current-directory';
  if (isAncestorOrEqual(out, norm(dirname(ctx.swfPath)))) return 'contains-input-swf';
  return null;
}
