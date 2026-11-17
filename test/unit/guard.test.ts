// Task 10.2 (robustness Requirements 6.5, 6.9, 6.10, 6.11, 6.13): RunGuard with a fake clock.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGuard, RunAbortedError, TimeLimitError } from '../../src/pipeline/guard';
import { defaultLimits, stageAllowanceS } from '../../src/pipeline/limits';
import { classifyError } from '../../src/outcome/classifyError';
import { decideOutcome } from '../../src/outcome/outcome';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineStages } from '../../src/pipeline/pipeline';
import { buildSwf } from '../support/hostileSwf';
import { createFakeClock } from '../support/fakeClock';

const S = 1000;

function setup(limits = defaultLimits()) {
  const clock = createFakeClock();
  const killAll = vi.fn(async () => undefined);
  const guard = createGuard({ clock, limits, killAll });
  return { clock, killAll, guard, limits };
}

/** A stage that takes `ms` of fake time. */
const takes = (clock: ReturnType<typeof createFakeClock>, ms: number) => () =>
  new Promise<string>((resolve) => {
    clock.setTimeout(() => resolve('done'), ms);
  });

describe('RunGuard.runStage', () => {
  it('records a stage that finishes in time', async () => {
    const { clock, guard, killAll } = setup();
    const p = guard.runStage('convert', takes(clock, 10 * S));
    await Promise.resolve();
    clock.advance(10 * S);
    expect(await p).toBe('done');
    expect(guard.records).toEqual([{ name: 'convert', result: 'ok', durationMs: 10 * S }]);
    expect(killAll).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(0);
  });

  it('refuses a stage that exceeds its weighted allowance, kills children and abandons it', async () => {
    const { clock, guard, killAll } = setup();
    let settled = false;
    const p = guard.runStage('unpack', () => new Promise<never>(() => { settled = true; }));
    const caught = p.catch((e: unknown) => e);
    await Promise.resolve();
    clock.advance(119 * S);
    expect(killAll).not.toHaveBeenCalled();
    clock.advance(1 * S);
    const err = await caught;
    expect(settled).toBe(true);
    expect(err).toBeInstanceOf(TimeLimitError);
    expect(err).toMatchObject({ stage: 'unpack', limit: '120 s stage limit' });
    expect(killAll).toHaveBeenCalledTimes(1);
    expect(guard.records).toEqual([{ name: 'unpack', result: 'error', durationMs: 120 * S }]);
    const failure = classifyError(err, 'unpack');
    expect(failure).toEqual({ kind: 'refused', reasonCode: 'time-limit', stage: 'unpack', limit: '120 s stage limit' });
    const d = decideOutcome({ facts: null, stages: guard.records, failure, numbers: null, gaps: [], limits: guard.limits, recovery: null });
    expect(d).toMatchObject({ outcome: 'refused', reasonCode: 'time-limit', exitCode: 3 });
    expect(d.reason).toContain('unpack');
    expect(d.reason).toContain('120 s stage limit');
  });

  it('stops a stage at the run limit when less time is left than its allowance', async () => {
    const limits = { ...defaultLimits(), runLimitS: 100 };
    const { clock, guard, killAll } = setup(limits);
    const first = guard.runStage('convert', takes(clock, 50 * S));
    await Promise.resolve();
    clock.advance(50 * S);
    await first;
    const second = guard.runStage('unpack', () => new Promise<never>(() => undefined));
    const caught = second.catch((e: unknown) => e);
    await Promise.resolve();
    clock.advance(50 * S);
    expect(await caught).toMatchObject({ stage: 'unpack', limit: '100 s run limit' });
    expect(killAll).toHaveBeenCalledTimes(1);
  });

  it('refuses to start a stage once the run limit is used up', async () => {
    const limits = { ...defaultLimits(), runLimitS: 60, stageLimitS: 60 };
    const { clock, guard } = setup(limits);
    clock.advance(60 * S);
    const fn = vi.fn(async () => 1);
    await expect(guard.runStage('emit', fn)).rejects.toMatchObject({ code: 'TIME_LIMIT', stage: 'emit', limit: '60 s run limit' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('passes a stage error through without killing children', async () => {
    const { guard, killAll } = setup();
    await expect(guard.runStage('emit', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(guard.records).toMatchObject([{ name: 'emit', result: 'error' }]);
    expect(killAll).not.toHaveBeenCalled();
  });

  it('keeps the limits it was given and allows recover 120 s by default', () => {
    const resolved = { ...defaultLimits(), runLimitS: 90, stageLimitS: 7 };
    expect(setup(resolved).guard.limits).toEqual(resolved);
    expect(stageAllowanceS(defaultLimits(), 'recover')).toBe(120);
  });
});

describe('runPipeline with the guard', () => {
  it('ends refused time-limit with exit 3, the stage and the limit in the Outcome_File', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'guard-test-'));
    try {
      await writeFile(join(tmp, 'a.swf'), buildSwf());
      const clock = createFakeClock();
      const stages = {
        unpack: () => {
          // Time passes only when the test says so; this stage never settles.
          setImmediate(() => clock.advance(120 * S));
          return new Promise<never>(() => undefined);
        },
      } as unknown as PipelineStages;
      let out = '';
      let err = '';
      const code = await runPipeline(
        { swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar', templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp, clock },
        stages,
        { out: (s) => void (out += s), err: (s) => void (err += s) },
      );
      expect(code).toBe(3);
      const o = JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));
      expect(o).toMatchObject({ outcome: 'refused', reasonCode: 'time-limit', limits: defaultLimits() });
      expect(o.reason).toContain('unpack');
      expect(o.stages).toEqual([{ name: 'unpack', result: 'error', durationMs: 120 * S }]);
      expect(out).toContain('Outcome: refused time-limit');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('RunGuard.abort', () => {
  it('rejects the running stage with RunAbortedError, kills children and classifies as failed', async () => {
    const { guard, killAll } = setup();
    const p = guard.runStage('unpack', () => new Promise<never>(() => undefined));
    await Promise.resolve();
    await guard.abort('signal');
    const err = await p.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(RunAbortedError);
    expect(killAll).toHaveBeenCalled();
    expect(guard.records).toEqual([{ name: 'unpack', result: 'error', durationMs: 0 }]);
    expect(classifyError(err, 'unpack')).toMatchObject({ kind: 'internal', reason: 'run stopped by signal' });
  });

  it('rejects every later stage at once and tolerates a second abort', async () => {
    const { guard } = setup();
    await guard.abort('signal');
    await guard.abort('signal');
    const fn = vi.fn(async () => 1);
    await expect(guard.runStage('convert', fn)).rejects.toBeInstanceOf(RunAbortedError);
    expect(fn).not.toHaveBeenCalled();
  });
});
