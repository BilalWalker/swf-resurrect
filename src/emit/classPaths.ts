// Core: no node:* import. Paths are strings joined with '/'.
import { parseQualifiedName, relativeSpecifier, shimSpecifier } from '../convert/qualifiedName';
import type { ImportRecord } from '../translate/types';

export interface ClassPathChoice {
  /** Qualified_Name. */
  className: string;
  /** Canonical path 'src/a/b/Cls.ts'. */
  originalPath: string;
  /** Chosen path, same directory depth as originalPath. */
  path: string;
  /** path !== originalPath. */
  renamed: boolean;
}

/** One entry of classPaths in EmitResult and the Translation_Report. */
export interface ClassPathEntry {
  className: string;
  originalPath: string;
  path: string;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Order by (lower-cased parent, segment), both by UTF-16 code unit. */
function comparePair(a: readonly [string, string], b: readonly [string, string]): number {
  return byCodeUnit(a[0].toLowerCase(), b[0].toLowerCase()) || byCodeUnit(a[1], b[1]);
}

/**
 * Deterministic and independent of the order of `classNames`. `reserved` are the other emitted paths
 * (for example 'src/main.ts', 'src/classes.ts', 'src/timelineOnly.ts', 'package.json', assets).
 * All comparisons are on lower-cased segments (the Case_Collision test); only a colliding segment changes:
 * `_class`, `_class2`, ... for a directory, `.class`, `.class2`, ... for a file.
 */
export function planClassPaths(classNames: readonly string[], reserved: readonly string[]): ClassPathChoice[] {
  const names = [...new Set(classNames)].sort(byCodeUnit);
  const parts = names.map((n) => ({ name: n, ...parseQualifiedName(n) }));

  // taken: lower-cased parent directory -> lower-cased entry names used there.
  const taken = new Map<string, Set<string>>();
  const take = (parent: string, entry: string): void => {
    const key = parent.toLowerCase();
    let set = taken.get(key);
    if (!set) taken.set(key, (set = new Set()));
    set.add(entry.toLowerCase());
  };
  const isTaken = (parent: string, entry: string): boolean => taken.get(parent.toLowerCase())?.has(entry.toLowerCase()) ?? false;
  /** base+suffix, base+suffix2, base+suffix3, ... : the first form not taken. */
  const firstFree = (parent: string, base: string, suffix: string, ext: string): string => {
    for (let i = 1; ; i++) {
      const alt = base + suffix + (i === 1 ? '' : String(i)) + ext;
      if (!isTaken(parent, alt)) return alt;
    }
  };

  for (const r of reserved) {
    const segs = r.split('/');
    for (let i = 0; i < segs.length; i++) take(segs.slice(0, i).join('/'), segs[i]);
  }

  // Directories, shallowest first. chosenDir: original package prefix ('' = none) -> chosen directory path.
  const chosenDir = new Map<string, string>([['', 'src']]);
  const maxDepth = parts.reduce((m, p) => Math.max(m, p.pkg.length), 0);
  for (let k = 1; k <= maxDepth; k++) {
    const pairs = new Map<string, { parent: string; segment: string; prefix: string; parentPrefix: string }>();
    for (const p of parts) {
      if (p.pkg.length < k) continue;
      const parentPrefix = p.pkg.slice(0, k - 1).join('.');
      const prefix = p.pkg.slice(0, k).join('.');
      pairs.set(prefix, { parent: chosenDir.get(parentPrefix)!, segment: p.pkg[k - 1], prefix, parentPrefix });
    }
    const ordered = [...pairs.values()].sort((a, b) => comparePair([a.parent, a.segment], [b.parent, b.segment]));
    for (const d of ordered) {
      const name = isTaken(d.parent, d.segment) ? firstFree(d.parent, d.segment, '_class', '') : d.segment;
      take(d.parent, name);
      chosenDir.set(d.prefix, `${d.parent}/${name}`);
    }
  }

  // Files, in the same order.
  const files = parts
    .map((p) => ({ ...p, dir: chosenDir.get(p.pkg.join('.'))! }))
    .sort((a, b) => comparePair([a.dir, a.simple], [b.dir, b.simple]));
  const out: ClassPathChoice[] = [];
  for (const f of files) {
    const plain = `${f.simple}.ts`;
    const file = isTaken(f.dir, plain) ? firstFree(f.dir, f.simple, '.class', '.ts') : plain;
    take(f.dir, file);
    out.push({
      className: f.name,
      originalPath: ['src', ...f.pkg, f.simple].join('/') + '.ts',
      path: `${f.dir}/${file}`,
      renamed: false,
    });
  }
  for (const c of out) c.renamed = c.path !== c.originalPath;
  return out.sort((a, b) => byCodeUnit(a.className, b.className));
}

/**
 * Replaces exactly the recorded import lines of one translated class (by 1-based line number, never by
 * matching text) with lines whose specifiers resolve to the chosen paths. A class record whose target has
 * no chosen path keeps its line unchanged.
 */
export function resolveImportLines(
  text: string,
  records: readonly ImportRecord[],
  fromPath: string,
  chosen: ReadonlyMap<string, string>,
): string {
  const lines = text.split('\n');
  for (const r of records) {
    const idx = r.line - 1;
    if (idx < 0 || idx >= lines.length) continue;
    let spec: string;
    if (r.kind === 'shim') spec = shimSpecifier(fromPath);
    else {
      const to = r.target === undefined ? undefined : chosen.get(r.target);
      if (to === undefined) continue;
      spec = relativeSpecifier(fromPath, to);
    }
    const names = r.names.map((n) => (n.alias === undefined ? n.name : `${n.name} as ${n.alias}`)).join(', ');
    lines[idx] = `import { ${names} } from '${spec}';`;
  }
  return lines.join('\n');
}

/**
 * Binding names for src/classes.ts: unnamed-package classes keep the simple name; dotted names get
 * `pkg_segments_Simple`; a clash with an earlier binding or with `classRegistry` appends `_2`, `_3`, ...
 */
export function buildBindings(classNames: readonly string[]): ReadonlyMap<string, string> {
  const names = [...new Set(classNames)].sort(byCodeUnit);
  const parts = names.map((n) => ({ name: n, ...parseQualifiedName(n) }));
  const out = new Map<string, string>();
  const used = new Set<string>(['classRegistry']);
  for (const p of parts) {
    if (p.pkg.length > 0) continue;
    out.set(p.name, p.simple);
    used.add(p.simple);
  }
  for (const p of parts) {
    if (p.pkg.length === 0) continue;
    const base = [...p.pkg, p.simple].join('_');
    let b = base;
    for (let i = 2; used.has(b); i++) b = `${base}_${i}`;
    used.add(b);
    out.set(p.name, b);
  }
  return out;
}