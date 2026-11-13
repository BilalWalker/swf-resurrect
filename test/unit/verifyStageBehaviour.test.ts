import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyStage } from '../../src/verify/edge/verifyStage';
import type { VerifyDeps } from '../../src/verify/edge/verifyStage';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'verify-behaviour-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Stub {
  lines?: string[];
  ticksRun?: number;
  error?: { tick: number; message: string } | null;
  childFailure?: boolean;
  reject?: boolean;
}

async function run(trace: string | null, stub: Stub): Promise<{ behaviour: any; problems: any[] }> {
  const ref = join(root, 'reference');
  await mkdir(ref, { recursive: true });
  if (trace !== null) await writeFile(join(ref, 'output.txt'), trace);
  await writeFile(join(ref, 'input.json'), '[]');
  await writeFile(join(ref, 'test.toml'), 'num_frames = 3\n');
  const deps: Partial<VerifyDeps> = {
    exportReferenceFrames: async () => new Map(),
    replay: async () => {
      if (stub.reject) throw new Error('boom');
      return {
        lines: (stub.lines ?? []).map((text, i) => ({ text, tick: i })),
        ticksRun: stub.ticksRun ?? 0,
        error: stub.error ?? null,
        releaseOutside: [],
        childFailure: stub.childFailure ?? false,
      } as never;
    },
  };
  await verifyStage({
    swfPath: join(root, 'x.swf'),
    jarPath: 'none',
    outputDir: join(root, 'out'),
    projectDir: join(root, 'out'),
    scene: { formatVersion: 1, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as never,
    unsupported: [],
    translationReport: { formatVersion: 1, typeCheck: 'skipped', classes: [], omittedClasses: [], otherErrors: [], classPaths: [] } as never,
    sampleName: 's',
    referenceDir: ref,
    deps,
  });
  const report = JSON.parse(await readFile(join(root, 'out', 'fidelity-report.json'), 'utf8'));
  return { behaviour: report.behaviour, problems: report.problems };
}

const FIVE = 'a\nb\nc\nd\ne\n';

describe('verifyStage behaviour decision', () => {
  it('a throw after two of five lines is compared with 3 missing and score 40', async () => {
    const r = await run(FIVE, { lines: ['a', 'b'], ticksRun: 2, error: { tick: 2, message: 'oops' } });
    expect(r.behaviour.status).toBe('compared');
    expect(r.behaviour.missing.map((m: any) => m.line)).toEqual([3, 4, 5]);
    expect(r.behaviour.traceScore).toBe(40);
    expect(r.behaviour.replay.ticksRun).toBe(2);
    expect(r.problems.filter((p) => p.kind === 'replay-error')).toEqual([{ kind: 'replay-error', tick: 2, detail: 'oops' }]);
  });

  it('a throw before any line is compared, all lines missing, score 0', async () => {
    const r = await run(FIVE, { error: { tick: 0, message: 'early' } });
    expect(r.behaviour.status).toBe('compared');
    expect(r.behaviour.missing).toHaveLength(5);
    expect(r.behaviour.traceScore).toBe(0);
  });

  it('a child failure with a non-empty reference is not-compared: replay-failed', async () => {
    const r = await run(FIVE, { error: { tick: 0, message: 'timed out' }, childFailure: true });
    expect(r.behaviour).toMatchObject({ status: 'not-compared', reason: 'replay-failed' });
    expect(r.problems.filter((p) => p.kind === 'replay-error')).toHaveLength(1);
  });

  it('a rejected deps.replay is a child failure', async () => {
    const r = await run(FIVE, { reject: true });
    expect(r.behaviour).toMatchObject({ status: 'not-compared', reason: 'replay-failed' });
  });

  it('no trace is not-compared: no-reference-trace', async () => {
    const r = await run(null, {});
    expect(r.behaviour).toMatchObject({ status: 'not-compared', reason: 'no-reference-trace' });
  });

  it('an empty reference with one captured line has no score', async () => {
    const r = await run('', { lines: ['x'], ticksRun: 1 });
    expect(r.behaviour).toMatchObject({ status: 'not-compared', reason: 'empty-reference-trace' });
    expect(r.behaviour.traceScore).toBeUndefined();
    expect(r.problems.filter((p) => p.kind === 'replay-error')).toEqual([]);
  });

  it('an empty reference with a Replay that threw records one replay-error', async () => {
    const r = await run('', { error: { tick: 1, message: 'bad' }, ticksRun: 1 });
    expect(r.behaviour).toMatchObject({ status: 'not-compared', reason: 'empty-reference-trace' });
    expect(r.problems.filter((p) => p.kind === 'replay-error')).toHaveLength(1);
  });
});
