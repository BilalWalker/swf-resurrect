// Cleanup plan (robustness design "Cleanup plan", Requirements 4.6, 6.7, 9.2, 9.3). Pure: no fs, no node:*.
//
// Paths are posix paths relative to the output directory. `preExisting` is the listing of the output directory
// taken after the precheck and before the first write. `writtenByRun` is Emit's journal (onWrite) plus the files
// Emit returned plus the report files.
//
// Interaction with `--force`: Emit with force clears the directory before it writes. Cleanup never recreates a file
// that Emit deleted, and a path that is both pre-existing and written again by the run is treated as pre-existing
// (it stays). So after a refusal following `--force` the directory holds fewer files than before the run, never
// more than `preExisting` plus the protected files.

/** Files that stay after a refusal or failure: the Outcome_File and the reports (Requirement 9.3). */
export const PROTECTED_FILES: readonly string[] = [
  'outcome.json',
  'unsupported-features.json',
  'translation-report.json',
  'fidelity-report.json',
  'fidelity-report.html',
];

/** The Failure_Log `failure-<Reference_Id>.log` and the FFDec log `ffdec-<Reference_Id>.log` (D-A6). */
const LOG_NAME = /^(failure|ffdec)-[0-9a-f]{8}\.log$/;

export interface CleanupInput {
  /** Entries (files and directories) of the output directory before the first write. */
  preExisting: readonly string[];
  /** Files the run wrote: the journal and the final file list. */
  writtenByRun: readonly string[];
  /** Extra paths to keep, on top of PROTECTED_FILES and the log names. */
  keep: readonly string[];
}

export interface CleanupPlan {
  /** Files to delete, sorted. */
  files: string[];
  /** Directories the run created that may be empty afterwards, deepest first. The edge removes them with rmdir. */
  directories: string[];
}

function normalise(p: string): string {
  return p.split('\\').join('/').replace(/^\.\//, '');
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isProtected(path: string, keep: readonly string[]): boolean {
  const p = normalise(path);
  if (keep.some((k) => normalise(k) === p)) return true;
  if (PROTECTED_FILES.includes(p)) return true;
  return LOG_NAME.test(p);
}

export function planCleanup(input: CleanupInput): CleanupPlan {
  const pre = new Set(input.preExisting.map(normalise));
  const files = new Set<string>();
  for (const w of input.writtenByRun) {
    const p = normalise(w);
    if (pre.has(p) || isProtected(p, input.keep)) continue;
    files.add(p);
  }
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = parts.length - 1; i >= 1; i--) {
      const d = parts.slice(0, i).join('/');
      if (!pre.has(d)) dirs.add(d);
    }
  }
  return {
    files: [...files].sort(byCodeUnit),
    directories: [...dirs].sort((a, b) => b.split('/').length - a.split('/').length || byCodeUnit(a, b)),
  };
}
