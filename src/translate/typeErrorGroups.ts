/**
 * Pure grouping of type errors by root cause (robustness Task 33.1, design D-E4).
 * No node:* import. `scripts/group-type-errors.ts` does the I/O.
 *
 * A group is identified by a key built from the TypeScript code and the names the message
 * quotes, so that every `Cannot find name 'X'` for one X is one group whatever the line or
 * the class, and every `Property 'p' does not exist on type 'T'` for one pair is one group.
 */

export interface TypeErrorLike {
  readonly code: number;
  readonly message: string;
}

export interface FileErrors {
  readonly file: string;
  readonly errors: readonly TypeErrorLike[];
}

export type TypeErrorKind =
  | "name-not-found"
  | "member-missing"
  | "not-assignable"
  | "implicit-any"
  | "not-a-module"
  | "other";

export interface TypeErrorKey {
  readonly key: string;
  readonly kind: TypeErrorKind;
}

export interface TypeErrorGroup {
  readonly key: string;
  readonly kind: TypeErrorKind;
  readonly total: number;
  /** Count per file, in the order the files were given; 0 when the file has none. */
  readonly perFile: Readonly<Record<string, number>>;
}

const NAME_CODES = new Set([2304, 2552, 2663]);
const MEMBER_CODES = new Set([2339, 2551]);

function firstLine(message: string): string {
  const i = message.indexOf("\n");
  return i < 0 ? message : message.slice(0, i);
}

/** The key of one error. Pure and total: any code and message give a key. */
export function typeErrorKey(code: number, message: string): TypeErrorKey {
  const first = firstLine(message).trim();
  if (NAME_CODES.has(code)) {
    const m = /^Cannot find name '([^']+)'/.exec(first);
    if (m) return { key: `TS2304 name ${m[1]}`, kind: "name-not-found" };
  }
  if (MEMBER_CODES.has(code)) {
    const m = /^Property '([^']+)' does not exist on type '([^']+)'/.exec(first);
    if (m) return { key: `TS2339 ${m[2]}.${m[1]}`, kind: "member-missing" };
  }
  if (code === 2345 || code === 2322) {
    const m = /is not assignable to (?:parameter of )?type '([^']+)'/.exec(first);
    if (m) {
      const priv = /Property '([^']+)' is private in type/.exec(message);
      const detail = priv ? `private member ${priv[1]}` : /is missing the following properties/.test(message) ? "missing members" : "other";
      return { key: `TS${code} to ${m[1]} (${detail})`, kind: "not-assignable" };
    }
  }
  if (code === 2306) return { key: "TS2306 file is not a module", kind: "not-a-module" };
  if (code === 7015 || code === 7053) {
    return { key: `TS${code} ${first.replace(/'[^']*'/g, "'#'")}`, kind: "implicit-any" };
  }
  return { key: `TS${code} ${first.replace(/'[^']*'/g, "'#'")}`, kind: "other" };
}

/** Groups the errors of all files; sorted by total descending, then by key (stable, locale-free). */
export function groupTypeErrors(files: readonly FileErrors[]): TypeErrorGroup[] {
  const acc = new Map<string, { kind: TypeErrorKind; counts: Map<string, number> }>();
  for (const f of files) {
    for (const e of f.errors) {
      const k = typeErrorKey(e.code, e.message);
      let g = acc.get(k.key);
      if (!g) {
        g = { kind: k.kind, counts: new Map() };
        acc.set(k.key, g);
      }
      g.counts.set(f.file, (g.counts.get(f.file) ?? 0) + 1);
    }
  }
  const out: TypeErrorGroup[] = [];
  for (const [key, g] of acc) {
    const perFile: Record<string, number> = {};
    let total = 0;
    for (const f of files) {
      const n = g.counts.get(f.file) ?? 0;
      perFile[f.file] = n;
      total += n;
    }
    out.push({ key, kind: g.kind, total, perFile });
  }
  out.sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

export function topGroups(groups: readonly TypeErrorGroup[], n: number): TypeErrorGroup[] {
  return groups.slice(0, Math.max(0, n));
}
