// End-to-end smoke test: real FFDec, real npm install, typecheck and build of every emitted project.
// Requirements: 4.8, 5.5, 5.6, 5.7, 9.1, 10.5, 10.6, 10.8.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../../src/pipeline/cli';

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

async function findSwfs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
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
    if (!x.equals(y)) diffs.push(`differs: ${f}`);
  }
  return diffs;
}

describe('pipeline end to end', () => {
  let tempRoot = '';
  let swfs: string[] = [];

  beforeAll(async () => {
    let java: RunResult;
    try {
      java = await run('java', ['-version'], REPO_ROOT);
    } catch {
      throw new Error('Missing dependency: Java (`java` not found on PATH; FFDec needs Java 17+)');
    }
    if (java.code !== 0) throw new Error('Missing dependency: Java (`java -version` failed)');
    if (!existsSync(FFDEC_JAR)) throw new Error(`Missing dependency: FFDec jar not found at ${FFDEC_JAR}`);
    swfs = await findSwfs(SAMPLES_DIR);
    if (swfs.length === 0) throw new Error(`Missing dependency: no Sample_SWF (*.swf) found under ${SAMPLES_DIR}`);
    await mkdir(NPM_CACHE, { recursive: true });
    tempRoot = await mkdtemp(join(tmpdir(), 'swf-resurrect-e2e-'));
  }, 60_000);

  afterAll(async () => {
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  it(
    'emits deterministic projects that install, typecheck and build',
    async () => {
      for (const [i, swf] of swfs.entries()) {
        const name = `${i}-${relative(SAMPLES_DIR, swf).replace(/[^A-Za-z0-9]+/g, '_')}`;
        const outA = join(tempRoot, 'a', name);
        const outB = join(tempRoot, 'b', name);

        expect(await main([swf, outA]), `pipeline run 1 for ${swf}`).toBe(0);
        expect(await main([swf, outB]), `pipeline run 2 for ${swf}`).toBe(0);

        // Same input, same output tree, byte for byte (before npm adds node_modules).
        expect(await compareTrees(outA, outB), `output trees differ for ${swf}`).toEqual([]);

        for (const script of [['install', '--no-audit', '--no-fund'], ['run', 'typecheck'], ['run', 'build']]) {
          const r = await npm(script, outA);
          expect(r.code, `npm ${script.join(' ')} in ${outA}\n${r.output}`).toBe(0);
        }

        const distDir = join(outA, 'dist');
        expect((await stat(join(distDir, 'index.html'))).isFile(), `dist/index.html for ${swf}`).toBe(true);
        const built = await listFiles(distDir);
        expect(
          built.some((f) => f.endsWith('.js')),
          `a JavaScript file in dist for ${swf}`,
        ).toBe(true);
      }
    },
    TIMEOUT_MS,
  );
});
