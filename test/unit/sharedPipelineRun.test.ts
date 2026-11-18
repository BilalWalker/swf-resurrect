// The shared pipeline run cache (task 29.1): same inputs give one run, a changed input gives a new one, and the
// bypass variable gives every caller a fresh run. A counting fake stands in for the pipeline child process.
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSharedRuns, hasRenderFailure, NO_RUN_CACHE_ENV } from '../support/sharedPipelineRun';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('shared pipeline run cache', () => {
  let root = '';
  let swf = '';
  let calls: string[][] = [];
  let common = 'c1';
  let bypass = false;
  const make = () =>
    createSharedRuns({
      sharedDir: join(root, 'shared'),
      common: () => common,
      bypass: () => bypass,
      run: async (args, logPath) => {
        calls.push(args);
        await mkdir(args[1]!, { recursive: true });
        await writeFile(join(args[1]!, 'marker'), String(calls.length));
        await writeFile(logPath, 'ok');
        return 0;
      },
    });

  beforeAll(async () => {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    root = await mkdtemp(resolve(repoRoot, '.work', 'shared-run-unit-'));
    await mkdir(join(root, 'sample'));
    swf = join(root, 'sample', 'test.swf');
    await writeFile(swf, 'swf-bytes-1');
  });
  afterAll(async () => {
    if (root !== '') await rm(root, { recursive: true, force: true });
  });

  it('names the bypass variable', () => {
    expect(NO_RUN_CACHE_ENV).toBe('SWF_RESURRECT_NO_RUN_CACHE');
  });

  it('runs the pipeline once for the same inputs, also from a second worker', async () => {
    calls = [];
    const [a, b] = await Promise.all([make()('s', swf), make()('s', swf)]); // two instances stand for two workers
    const c = await make()('s', swf);
    expect(calls).toHaveLength(1);
    expect([a.outDir, b.outDir, c.outDir]).toEqual([a.outDir, a.outDir, a.outDir]);
    expect(calls[0]).toEqual([swf, a.outDir, '--verify', '--force']);
  });

  it('runs again, in a new directory, when the sample bytes, a source input or the options change', async () => {
    calls = [];
    const first = await make()('t', swf);
    await writeFile(swf, 'swf-bytes-2');
    const changedSample = await make()('t', swf);
    common = 'c2';
    const changedSource = await make()('t', swf);
    const changedArgs = await make()('t', swf, { extraArgs: ['--reference-dir', 'x'] });
    expect(calls).toHaveLength(4);
    expect(new Set([first.outDir, changedSample.outDir, changedSource.outDir, changedArgs.outDir]).size).toBe(4);
    expect(calls[3]).toEqual([swf, changedArgs.outDir, '--verify', '--force', '--reference-dir', 'x']);
    expect(existsSync(first.outDir), 'the stale run of the same sample is removed').toBe(false);
  });

  it('keeps a run with a render failure only as long as a failed run', async () => {
    calls = [];
    const shaky = () =>
      createSharedRuns({
        sharedDir: join(root, 'shared'),
        common: () => common,
        bypass: () => false,
        unstable: async () => calls.length === 1, // only the first run has a render failure
        run: async (args, logPath) => {
          calls.push(args);
          await mkdir(args[1]!, { recursive: true });
          await writeFile(logPath, 'ok');
          return 0;
        },
      });
    const first = await shaky()('v', swf);
    const again = await shaky()('v', swf); // same suite: reused, so the tests still see the failure
    expect(calls).toHaveLength(1);
    const old = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(join(first.outDir, '..', 'DONE'), old, old); // a later suite
    const later = await shaky()('v', swf);
    const stable = await shaky()('v', swf);
    await utimes(join(first.outDir, '..', 'DONE'), old, old);
    const stillKept = await shaky()('v', swf);
    expect(calls).toHaveLength(2);
    expect([again.code, later.code, stable.code, stillKept.code]).toEqual([0, 0, 0, 0]);
  });

  it('reads a render-failed problem from the fidelity report', async () => {
    const dir = join(root, 'report');
    await mkdir(dir, { recursive: true });
    expect(await hasRenderFailure(dir)).toBe(false);
    await writeFile(join(dir, 'fidelity-report.json'), JSON.stringify({ problems: [{ kind: 'size-mismatch' }] }));
    expect(await hasRenderFailure(dir)).toBe(false);
    await writeFile(join(dir, 'fidelity-report.json'), JSON.stringify({ problems: [{ kind: 'render-failed', frame: 3 }] }));
    expect(await hasRenderFailure(dir)).toBe(true);
  });

  it('gives every caller a fresh run when the cache is bypassed', async () => {
    calls = [];
    bypass = true;
    try {
      const run = make();
      const a = await run('u', swf);
      const b = await run('u', swf);
      expect(calls).toHaveLength(2);
      expect(a.outDir).not.toBe(b.outDir);
    } finally {
      bypass = false;
    }
  });
});
