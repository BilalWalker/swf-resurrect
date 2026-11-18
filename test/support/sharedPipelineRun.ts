// One `--verify --force` pipeline run per sample, shared by every e2e file that reads that sample's report (task 29.1).
//
// Each run is a child process (`tsx src/pipeline/cli.ts`), so vitest workers do not share state. The run lives in
// `.work/shared-runs/<name>-<key>/`. Workers coordinate through a lock directory: the first one creates it and runs,
// the others wait for the `DONE` file. An empty `.work/` (fresh clone) just means every run is made once.
//
// Cache key inputs (a changed input gives a new key, and the old directory of that sample is removed):
//   - the sample bytes: every file under the sample's directory (and any extra `inputDirs`, e.g. a reference dir);
//   - `src/`, `template/` and `handwritten/` (all file contents; an override changes the run), `package.json` and `package-lock.json`;
//   - the FFDec jar, by a SHA-256 of its bytes (computed once per worker; size and mtime are not used);
//   - the pipeline options: the full argument list, `--verify --force` plus the caller's `extraArgs`;
//   - the Chromium build (the path of Playwright's executable, which carries its revision) and the node version.
//
// Reuse: a run that exited 0 is kept until an input changes, unless its report lists a `render-failed` frame (a
// Chromium wait that ran out on a busy machine). That run, like a failed one, is reused only for FAILED_REUSE_MS,
// so the suite that made it still reports it and the next suite runs it again.
//
// Bypass: set SWF_RESURRECT_NO_RUN_CACHE=1 and every call gets a fresh run of its own (no memo, no reuse across
// calls or workers). Leftover directories are removed by the next cached run of the same sample.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PIPELINE_SLOTS, withSlot } from './slots';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const WAIT_LIMIT_MS = 20 * 60 * 1000;
const STALE_LOCK_MS = 15 * 60 * 1000;
/** A failed run is reused only while it is this fresh (it belongs to the vitest run that is still going). */
const FAILED_REUSE_MS = 5 * 60 * 1000;
/** Environment variable that turns the cache off: every call then gets a fresh run. */
export const NO_RUN_CACHE_ENV = 'SWF_RESURRECT_NO_RUN_CACHE';
export interface SharedRun {
  /** The pipeline's output directory. */
  outDir: string;
  /** The pipeline's exit code. */
  code: number;
  /** Where the run's console output is kept. */
  logPath: string;
}
function walk(dir: string, into: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(full, into);
    } else into.push(full);
  }
}
/** SHA-256 over the paths and bytes of every file under `roots`, then over the `extra` strings. */
export function hashPaths(roots: readonly string[], extra: readonly string[]): string {
  const h = createHash('sha256');
  const files: string[] = [];
  for (const r of roots) if (existsSync(r)) (statSync(r).isDirectory() ? walk(r, files) : files.push(r));
  for (const f of files) {
    h.update(relative(repoRoot, f).replace(/\\/g, '/'));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  for (const e of extra) h.update(e + '\0');
  return h.digest('hex').slice(0, 16);
}
let commonKey: string | null = null;
/** Hash of the inputs every run shares (see the header); computed once per worker. */
function commonInputs(): string {
  if (commonKey === null) {
    let chromiumPath = '';
    try {
      chromiumPath = chromium.executablePath();
    } catch {
      /* the caller skips without Chromium */
    }
    const jar = resolve(repoRoot, 'tools/ffdec/ffdec-cli.jar');
    const jarHash = existsSync(jar) ? createHash('sha256').update(readFileSync(jar)).digest('hex') : 'jar-absent';
    commonKey = hashPaths(
      [resolve(repoRoot, 'src'), resolve(repoRoot, 'template'), resolve(repoRoot, 'handwritten'), resolve(repoRoot, 'package-lock.json'), resolve(repoRoot, 'package.json')],
      [jarHash, chromiumPath, process.version],
    );
  }
  return commonKey;
}
function runChild(args: string[], logPath: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const tsx = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');
    const child = spawn(process.execPath, [tsx, 'src/pipeline/cli.ts', ...args], { cwd: repoRoot, windowsHide: true });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      writeFile(logPath, output).then(() => resolvePromise(code ?? 1), reject);
    });
  });
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** What the cache needs from outside; the unit test replaces these. */
export interface SharedRunDeps {
  /** Directory holding the cached runs. */
  sharedDir: string;
  /** Hash of the inputs every run shares. */
  common: () => string;
  /** Runs the pipeline with these CLI arguments and returns its exit code. */
  run: (args: string[], logPath: string) => Promise<number>;
  /** True when the cache is bypassed. */
  bypass: () => boolean;
  /**
   * True when a run that exited 0 still holds a load-dependent failure (a frame whose render timed out). Such a run
   * is kept only as long as a failed one, so a busy suite does not leave it to every later suite. Default: never.
   */
  unstable?: (outDir: string) => Promise<boolean>;
}
/** True when the run's fidelity report lists a `render-failed` problem. */
export async function hasRenderFailure(outDir: string): Promise<boolean> {
  try {
    const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as { problems?: { kind?: string }[] };
    return (report.problems ?? []).some((p) => p.kind === 'render-failed');
  } catch {
    return false; // no report: the exit code already says what happened
  }
}
export interface SharedRunOptions {
  extraArgs?: string[];
  inputDirs?: string[];
}
export function createSharedRuns(deps: SharedRunDeps): (name: string, swfPath: string, opts?: SharedRunOptions) => Promise<SharedRun> {
  const memo = new Map<string, Promise<SharedRun>>();
  async function readDone(dir: string): Promise<{ code: number; keep: boolean; ageMs: number } | null> {
    const done = join(dir, 'DONE');
    if (!existsSync(done)) return null;
    const code = Number((await readFile(done, 'utf8')).trim());
    return { code, keep: code === 0 && !existsSync(join(dir, 'UNSTABLE')), ageMs: Date.now() - statSync(done).mtimeMs };
  }
  async function fresh(name: string, swfPath: string, args: string[]): Promise<SharedRun> {
    const dir = join(deps.sharedDir, `${name}-nocache-${randomBytes(6).toString('hex')}`);
    await mkdir(dir, { recursive: true });
    const result: SharedRun = { outDir: join(dir, 'out'), code: 0, logPath: join(dir, 'run.log') };
    result.code = await deps.run([swfPath, result.outDir, ...args], result.logPath);
    return result;
  }
  async function produce(name: string, swfPath: string, extraArgs: string[], inputDirs: string[]): Promise<SharedRun> {
    const args = ['--verify', '--force', ...extraArgs];
    if (deps.bypass()) return fresh(name, swfPath, args);
    const key = hashPaths([swfPath, ...inputDirs], [deps.common(), ...args]);
    const dir = join(deps.sharedDir, `${name}-${key}`);
    const result: SharedRun = { outDir: join(dir, 'out'), code: 0, logPath: join(dir, 'run.log') };
    await mkdir(deps.sharedDir, { recursive: true });
    const started = Date.now();
    for (;;) {
      const done = await readDone(dir);
      if (done !== null && (done.keep || done.ageMs < FAILED_REUSE_MS)) return { ...result, code: done.code };
      try {
        await mkdir(dir);
      } catch {
        /* the directory exists: a run is in progress, finished badly long ago, or is being cleaned up */
      }
      const lock = join(dir, 'lock');
      let owned = false;
      try {
        await mkdir(lock);
        owned = true;
      } catch {
        const age = existsSync(lock) ? Date.now() - statSync(lock).mtimeMs : 0;
        if (age > STALE_LOCK_MS) await rm(lock, { recursive: true, force: true });
      }
      if (owned) {
        try {
          // Other keys of the same sample are stale. A name that only starts with `${name}-` is another sample.
          for (const e of await readdir(deps.sharedDir)) {
            if (new RegExp(`^${name}-(nocache-)?[0-9a-f]+$`).test(e) && e !== `${name}-${key}`) {
              await rm(join(deps.sharedDir, e), { recursive: true, force: true });
            }
          }
          await rm(join(dir, 'DONE'), { force: true });
          await rm(join(dir, 'UNSTABLE'), { force: true });
          await rm(result.outDir, { recursive: true, force: true });
          const code = await deps.run([swfPath, result.outDir, ...args], result.logPath);
          if (code === 0 && deps.unstable !== undefined && (await deps.unstable(result.outDir))) await writeFile(join(dir, 'UNSTABLE'), '');
          await writeFile(join(dir, 'DONE'), String(code));
          return { ...result, code };
        } finally {
          await rm(lock, { recursive: true, force: true });
        }
      }
      if (Date.now() - started > WAIT_LIMIT_MS) throw new Error(`Timed out waiting for the shared pipeline run of ${name}`);
      await sleep(500);
    }
  }
  return (name, swfPath, opts = {}) => {
    if (deps.bypass()) return produce(name, swfPath, opts.extraArgs ?? [], opts.inputDirs ?? [resolve(swfPath, '..')]);
    const hit = memo.get(name);
    if (hit !== undefined) return hit;
    const p = produce(name, swfPath, opts.extraArgs ?? [], opts.inputDirs ?? [resolve(swfPath, '..')]);
    memo.set(name, p);
    return p;
  };
}
/**
 * Runs `main([swf, outDir, '--verify', '--force', ...extraArgs])` once for `name` and returns its output directory.
 * `extraArgs` and the sample directory (`inputDirs`) are part of the key.
 */
export const sharedPipelineRun = createSharedRuns({
  sharedDir: resolve(repoRoot, '.work', 'shared-runs'),
  common: commonInputs,
  run: (args, logPath) => withSlot('pipeline', PIPELINE_SLOTS, () => runChild(args, logPath)),
  bypass: () => process.env[NO_RUN_CACHE_ENV] === '1',
  unstable: hasRenderFailure,
});