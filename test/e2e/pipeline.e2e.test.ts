// End-to-end smoke test: real FFDec, real npm install, typecheck and build of every emitted project.
// Requirements: 4.8, 5.5, 5.6, 5.7, 9.1, 10.5, 10.6, 10.8.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sharedPipelineRun } from '../support/sharedPipelineRun';
import { PIPELINE_SLOTS, withSlot } from '../support/slots';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FFDEC_JAR = join(REPO_ROOT, 'tools', 'ffdec', 'ffdec-cli.jar');
const SAMPLES_DIR = join(REPO_ROOT, 'samples');
// Shared npm cache under the gitignored .work/ so pinned dependencies download once.
const NPM_CACHE = join(REPO_ROOT, '.work', 'npm-cache');
const TIMEOUT_MS = 10 * 60 * 1000;

interface RunResult {
  code: number | null;
  output: string;
}

function run(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code, output }));
  });
}

/**
 * One pipeline run (`tsx src/pipeline/cli.ts <args>`) as a child process. The samples of this file run concurrently,
 * and the pipeline keeps process-wide state (console output, the in-process type-check), so each run gets its own process.
 */
function main(args: string[]): Promise<RunResult> {
  const tsx = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return withSlot('pipeline', PIPELINE_SLOTS, () => run(process.execPath, [tsx, 'src/pipeline/cli.ts', ...args], REPO_ROOT));
}

/** Run npm without a shell: on Windows use node + npm-cli.js (npm.cmd cannot be spawned safely without a shell). */
function npm(args: string[], cwd: string): Promise<RunResult> {
  const env = { npm_config_cache: NPM_CACHE };
  if (process.platform !== 'win32') return run('npm', args, cwd, env);
  const candidates = [
    process.env.npm_execpath ?? '',
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter((p) => p.endsWith('npm-cli.js') && existsSync(p));
  if (candidates.length === 0) throw new Error('Missing dependency: npm-cli.js could not be located next to node');
  return run(process.execPath, [candidates[0], ...args], cwd, env);
}

function findSwfs(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.swf'))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort();
}

/**
 * outcome.json with its time-dependent field dropped (robustness D-A10: `stages[].durationMs` is the only one) and,
 * when `dropVerify`, without the `verify` stage entry that only a `--verify` run records. Other files: the bytes.
 */
function comparable(file: string, bytes: Buffer, dropVerify: boolean): Buffer {
  if (file !== 'outcome.json') return bytes;
  const record = JSON.parse(bytes.toString('utf8')) as { stages: { name: string; durationMs?: number }[] };
  record.stages = record.stages
    .filter((s) => !(dropVerify && s.name === 'verify'))
    .map(({ durationMs: _ignored, ...rest }) => rest);
  return Buffer.from(JSON.stringify(record));
}

async function compareTrees(a: string, b: string): Promise<string[]> {
  const [filesA, filesB] = await Promise.all([listFiles(a), listFiles(b)]);
  const diffs: string[] = [];
  const setB = new Set(filesB);
  const setA = new Set(filesA);
  for (const f of filesA) if (!setB.has(f)) diffs.push(`only in first run: ${f}`);
  for (const f of filesB) if (!setA.has(f)) diffs.push(`only in second run: ${f}`);
  for (const f of filesA) {
    if (!setB.has(f)) continue;
    const [x, y] = await Promise.all([readFile(join(a, f)), readFile(join(b, f))]);
    if (!comparable(f, x, false).equals(comparable(f, y, false))) diffs.push(`differs: ${f}`);
  }
  return diffs;
}

/**
 * The gate (TS 6.0.3) and `tsc` (TS 7) word some errors differently: TS2552 is TS2304 plus a spelling suggestion, and an
 * object-to-class assignment is TS2740 (missing properties) in 6.0.3 but TS2322 in 7. Both map to one code here.
 */
const normaliseCode = (code: number | string): number => {
  const n = Number(code);
  return n === 2552 ? 2304 : n === 2740 ? 2322 : n;
};

/** Sorted `file|TScode` keys of the errors the type-check gate reported, or null when the gate was skipped. */
async function reportedErrorKeys(projectDir: string): Promise<string[] | null> {
  const report = JSON.parse(await readFile(join(projectDir, 'translation-report.json'), 'utf8')) as {
    typeCheck: 'ran' | 'skipped';
    classes: { className: string; typeErrors: { code: number }[] }[];
    classPaths: { className: string; path: string }[];
    otherErrors: { file: string; code: number }[];
  };
  if (report.typeCheck !== 'ran') return null;
  const pathOf = new Map(report.classPaths.map((p) => [p.className, p.path]));
  const keys: string[] = report.otherErrors.map((e) => `${e.file}|${normaliseCode(e.code)}`);
  for (const c of report.classes) {
    for (const e of c.typeErrors) keys.push(`${pathOf.get(c.className) ?? `src/${c.className}.ts`}|${normaliseCode(e.code)}`);
  }
  return keys.sort();
}

/** Sorted `file|TScode` keys of the errors in `tsc` output (`file(line,col): error TSnnnn:`). */
function typecheckErrorKeys(output: string): string[] {
  const keys: string[] = [];
  for (const m of output.matchAll(/^(\S.*?)\(\d+,\d+\): error TS(\d+):/gm)) keys.push(`${m[1].replace(/\\/g, '/')}|${normaliseCode(m[2])}`);
  return keys.sort();
}

/**
 * What a `--verify` run adds to the tree of a run without it, and nothing else: the two fidelity report files and the
 * frame images of the verify stage (`verify/frames/<n>-reference|rendered|diff.png`, checked on a real shared run).
 * Emit and the two JSON reports are written the same way in both modes (pipeline.ts: `verify` is not passed to the
 * emit stage, and the reports do not read the verify summary), and the verify stage builds in a staging copy.
 */
const VERIFY_OUTPUTS: readonly (string | RegExp)[] = [
  'fidelity-report.json',
  'fidelity-report.html',
  /^verify\/frames\/\d+-(reference|rendered|diff)\.png$/,
];
const isVerifyOutput = (file: string): boolean => VERIFY_OUTPUTS.some((o) => (typeof o === 'string' ? o === file : o.test(file)));

/**
 * Compares a fresh run without --verify (`fresh`) with the tree of a run with --verify (`verified`): the file set of
 * `verified` must equal that of `fresh` plus verify outputs only. Returns the problems: files missing from `verified`,
 * files in `verified` that are neither in `fresh` nor verify outputs, and files whose bytes differ.
 */
async function compareWithVerifiedTree(fresh: string, verified: string): Promise<string[]> {
  const [filesFresh, filesVerified] = await Promise.all([listFiles(fresh), listFiles(verified)]);
  const inVerified = new Set(filesVerified);
  const inFresh = new Set(filesFresh);
  const diffs: string[] = [];
  for (const f of filesFresh) if (!inVerified.has(f)) diffs.push(`missing from the verify run: ${f}`);
  for (const f of filesVerified) if (!inFresh.has(f) && !isVerifyOutput(f)) diffs.push(`unexpected in the verify run: ${f}`);
  if (diffs.length > 0) return diffs;
  for (const f of filesFresh) {
    const [x, y] = await Promise.all([readFile(join(fresh, f)), readFile(join(verified, f))]);
    if (!comparable(f, x, false).equals(comparable(f, y, true))) diffs.push(`differs: ${f}`);
  }
  return diffs;
}

/**
 * npm install happens once: the first sample to reach it installs for real, the others reuse its node_modules when
 * their package.json is byte-identical to the installed one. Emit writes no package-lock.json (npm creates it during the
 * install), so package.json is the only emitted dependency input. `node_modules` is made available by a directory
 * junction, so nothing is copied and nothing the test later modifies is shared (typecheck and build write elsewhere).
 */
interface InstalledProject {
  dir: string;
  packageJson: Buffer;
}
let installer: Promise<InstalledProject | null> | null = null;
/** Which samples installed and which reused, with the identity check that backed each reuse (asserted per test). */
const installLog: { sample: string; how: 'installed' | 'reused'; from?: string; packageJson: Buffer }[] = [];
/** The node_modules junctions this file created, removed one by one before the temp root is deleted. */
const junctions: string[] = [];
/** Gives `projectDir` its node_modules: a real install for the first caller, else a junction when package.json is identical. */
async function provideNodeModules(name: string, projectDir: string): Promise<RunResult> {
  const packageJson = await readFile(join(projectDir, 'package.json'));
  const realInstall = () => withSlot('npm', 1, () => npm(['install', '--no-audit', '--no-fund'], projectDir));
  if (installer === null) {
    let settle!: (p: InstalledProject | null) => void;
    installer = new Promise((r) => (settle = r));
    let result: RunResult | undefined;
    try {
      result = await realInstall();
    } finally {
      settle(result !== undefined && result.code === 0 ? { dir: projectDir, packageJson } : null);
    }
    installLog.push({ sample: name, how: 'installed', packageJson });
    return result;
  }
  const first = await installer;
  if (first !== null && packageJson.equals(first.packageJson)) {
    // The identity that makes the reuse valid.
    expect(packageJson.equals(first.packageJson), `package.json of ${name} must be byte-identical to ${first.dir} to reuse its node_modules`).toBe(true);
    await symlink(join(first.dir, 'node_modules'), join(projectDir, 'node_modules'), 'junction');
    junctions.push(join(projectDir, 'node_modules'));
    installLog.push({ sample: name, how: 'reused', from: first.dir, packageJson });
    return { code: 0, output: '' };
  }
  const result = await realInstall();
  installLog.push({ sample: name, how: 'installed', packageJson });
  return result;
}
describe('pipeline end to end', () => {
  let tempRoot = '';
  const swfs = findSwfs(SAMPLES_DIR);

  beforeAll(async () => {
    let java: RunResult;
    try {
      java = await run('java', ['-version'], REPO_ROOT);
    } catch {
      throw new Error('Missing dependency: Java (`java` not found on PATH; FFDec needs Java 17+)');
    }
    if (java.code !== 0) throw new Error('Missing dependency: Java (`java -version` failed)');
    if (!existsSync(FFDEC_JAR)) throw new Error(`Missing dependency: FFDec jar not found at ${FFDEC_JAR}`);
    if (swfs.length === 0) throw new Error(`Missing dependency: no Sample_SWF (*.swf) found under ${SAMPLES_DIR}`);
    await mkdir(NPM_CACHE, { recursive: true });
    tempRoot = await mkdtemp(join(tmpdir(), 'swf-resurrect-e2e-'));
  }, 60_000);

  afterAll(async () => {
    try {
      for (const e of installLog) console.info(`npm install: ${e.sample} ${e.how}${e.from === undefined ? '' : ` from ${e.from}`}`);
      // Runs after every sample test has finished and covers only the samples that ran (a -t filter runs fewer).
      // When all emitted package.json files are identical, exactly one real install happened and the rest reused it.
      const identical = installLog.every((e) => e.packageJson.equals(installLog[0].packageJson));
      if (installLog.length > 0 && identical) {
        const installed = installLog.filter((e) => e.how === 'installed').length;
        console.info(`npm install count: ${installed} installed, ${installLog.length - installed} reused, ${installLog.length} samples`);
        expect(installed, 'one real npm install when every emitted package.json is identical').toBe(1);
      }
    } finally {
      // Remove each node_modules junction itself (the link, not its target) so the recursive delete below can never
      // walk through one into the installed node_modules.
      for (const link of junctions) {
        if ((await lstat(link).catch(() => null))?.isSymbolicLink()) await unlink(link);
      }
      if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);

  // One test per sample, run concurrently (task 29.1); each does what the single loop did, in the same order.
  if (swfs.length === 0) {
    it('has a Sample_SWF to run', () => {
      throw new Error(`Missing dependency: no Sample_SWF (*.swf) found under ${SAMPLES_DIR}`);
    });
  }
  for (const [i, swf] of swfs.entries()) {
    const name = `${i}-${relative(SAMPLES_DIR, swf).replace(/[^A-Za-z0-9]+/g, '_')}`;
    it.concurrent(
      `${name} emits a deterministic project that installs, typechecks and builds`,
      async () => {
        const problems: string[] = [];
        const outA = join(tempRoot, 'a', name);
        // Run A is FRESH: a pipeline child process started by this test, without --verify, into its own directory.
        // The second run is the shared `--verify` run of this sample (possibly cached, never compared with itself): its
        // file set must be run A's plus the verify outputs, and any other difference fails the test. Only when the
        // shared run is missing or failed is the second run a real run B without --verify.
        const sample = basename(dirname(swf));
        const [runA, shared] = await Promise.all([main([swf, outA]), sharedPipelineRun(sample, swf)]);
        expect(runA.code, `pipeline run 1 for ${swf}\n${runA.output}`).toBe(0);
        let diffs: string[];
        if (shared.code === 0) {
          diffs = await compareWithVerifiedTree(outA, shared.outDir);
        } else {
          const outB = join(tempRoot, 'b', name);
          const runB = await main([swf, outB]);
          expect(runB.code, `pipeline run 2 for ${swf}\n${runB.output}`).toBe(0);
          diffs = await compareTrees(outA, outB);
        }
        // Same input, same output tree, byte for byte (before npm adds node_modules).
        expect(diffs, `output trees differ for ${swf}`).toEqual([]);
        // One real npm install in total; other samples reuse it when their package.json is identical.
        const install = await provideNodeModules(name, outA);
        if (install.code !== 0) problems.push(`npm install in ${outA}\n${install.output}`);        // Type errors are reported, not fatal (tech steering; Requirements 23.2 and 25): a project with
        // gate-reported errors must show exactly those errors (same files, same codes), and a project
        // with none must type-check clean.
        const reported = await reportedErrorKeys(outA);
        const tc = await npm(['run', 'typecheck'], outA);
        const actual = typecheckErrorKeys(tc.output);
        if (reported === null) {
          if (tc.code !== 0) problems.push(`typecheck failed but the gate was skipped for ${swf}\n${tc.output}`);
        } else if (reported.length === 0) {
          if (tc.code !== 0) problems.push(`typecheck in ${outA} must be clean (no reported errors)\n${tc.output}`);
        } else if (JSON.stringify(actual) !== JSON.stringify(reported)) {
          problems.push(
            `typecheck errors differ from translation-report.json for ${swf}\nreported: ${JSON.stringify(reported)}\nactual:   ${JSON.stringify(actual)}`,
          );
        }

        const build = await npm(['run', 'build'], outA);
        if (build.code !== 0) {
          problems.push(`npm run build in ${outA}\n${build.output}`);
        } else {
          const distDir = join(outA, 'dist');
          if (!(await stat(join(distDir, 'index.html'))).isFile()) problems.push(`dist/index.html missing for ${swf}`);
          const built = await listFiles(distDir);
          if (!built.some((f) => f.endsWith('.js'))) problems.push(`no JavaScript file in dist for ${swf}`);
        }
        expect(problems, problems.join('\n----\n')).toEqual([]);
      },
      TIMEOUT_MS,
    );
  }
});
