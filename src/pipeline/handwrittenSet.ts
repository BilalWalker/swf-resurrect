// The Handwritten_Set (as3-coverage Requirement 33): which hand-written overrides the repository accepts, and why.
// The pure part has no I/O. Nothing here names a class or a sample.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface HandwrittenEntry {
  sample: string;
  /** Qualified class name: a packaged override `a/b/Cls.ts` is `a.b.Cls`. */
  className: string;
  reason: string;
  /** Optional licence label (for example `GPL-3.0`); omitted from the reports when absent. */
  licence?: string;
}

/** A listed override as the reports show it. */
export interface HandwrittenReportEntry {
  className: string;
  reason: string;
  licence?: string;
  /** A translated class of the same name was replaced by the override. */
  replacesTranslated: boolean;
}

export class HandwrittenSetError extends Error {}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Parses the text of SET.json. Throws HandwrittenSetError on a schema error or a duplicate (sample, className). */
export function parseHandwrittenSet(text: string): HandwrittenEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new HandwrittenSetError(`SET.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(raw)) throw new HandwrittenSetError('SET.json must be a JSON array');
  const out: HandwrittenEntry[] = [];
  const seen = new Set<string>();
  raw.forEach((item: unknown, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new HandwrittenSetError(`SET.json entry ${i} must be an object`);
    }
    const rec = item as Record<string, unknown>;
    for (const k of Object.keys(rec)) {
      if (k !== 'sample' && k !== 'className' && k !== 'reason' && k !== 'licence') {
        throw new HandwrittenSetError(`SET.json entry ${i} has an unknown key "${k}"`);
      }
    }
    for (const k of ['sample', 'className', 'reason'] as const) {
      if (!nonEmptyString(rec[k])) throw new HandwrittenSetError(`SET.json entry ${i}: "${k}" must be a non-empty string`);
    }
    if (rec['licence'] !== undefined && !nonEmptyString(rec['licence'])) {
      throw new HandwrittenSetError(`SET.json entry ${i}: "licence" must be a non-empty string when present`);
    }
    const entry: HandwrittenEntry = {
      sample: rec['sample'] as string,
      className: rec['className'] as string,
      reason: rec['reason'] as string,
      ...(rec['licence'] === undefined ? {} : { licence: rec['licence'] as string }),
    };
    const key = `${entry.sample}\u0000${entry.className}`;
    if (seen.has(key)) throw new HandwrittenSetError(`SET.json lists ${entry.sample}/${entry.className} twice`);
    seen.add(key);
    out.push(entry);
  });
  return out;
}

/** `a/b/Cls.ts` (or `a\b\Cls.ts`) is the override of class `a.b.Cls`. */
export function overrideClassName(relativePath: string): string {
  return relativePath.replace(/\.ts$/, '').split(/[\\/]/).join('.');
}

/** Splits override class names into those the set lists for this sample (with reason) and those it does not. */
export function classifyOverrides(
  sample: string,
  overrides: readonly string[],
  set: readonly HandwrittenEntry[],
  translatedClasses: ReadonlySet<string> = new Set(),
): { listed: HandwrittenReportEntry[]; unlisted: string[] } {
  const bySample = new Map(set.filter((e) => e.sample === sample).map((e) => [e.className, e]));
  const listed: HandwrittenReportEntry[] = [];
  const unlisted: string[] = [];
  for (const className of [...new Set(overrides)].sort()) {
    const e = bySample.get(className);
    if (e === undefined) unlisted.push(className);
    else {
      listed.push({
        className,
        reason: e.reason,
        ...(e.licence === undefined ? {} : { licence: e.licence }),
        replacesTranslated: translatedClasses.has(className),
      });
    }
  }
  return { listed, unlisted };
}

/** Class names of every `.ts` file under dir, packaged ones qualified; sorted. */
export async function listOverrideClasses(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listOverrideClasses(join(dir, entry.name), rel)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(overrideClassName(rel));
  }
  return out.sort();
}

/** Reads `<handwrittenRoot>/SET.json`; a missing file is an empty set. */
export async function readHandwrittenSet(handwrittenRoot: string): Promise<HandwrittenEntry[]> {
  let text: string;
  try {
    text = await readFile(join(handwrittenRoot, 'SET.json'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return parseHandwrittenSet(text);
}
