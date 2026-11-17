// Task 10.1 (robustness Requirements 6.1, 6.2, 6.3, 6.8, 6.13): Run_Limits resolver and its CLI options.
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/pipeline/cli';
import { defaultLimits, resolveLimits, stageAllowanceS, STAGE_WEIGHTS } from '../../src/pipeline/limits';

const resolve = (options: Parameters<typeof resolveLimits>[0]['options'], env: Record<string, string> = {}) =>
  resolveLimits({ options, env });

describe('resolveLimits', () => {
  it('uses the defaults when nothing is set', () => {
    expect(resolve({})).toEqual({ ok: true, limits: defaultLimits() });
    const d = defaultLimits();
    expect([d.maxSizeMiB, d.runLimitS, d.stageLimitS]).toEqual([20, 300, 60]);
  });

  it('option beats variable beats default', () => {
    const env = { SWF_RESURRECT_MAX_SIZE_MIB: '5', SWF_RESURRECT_RUN_LIMIT_S: '100', SWF_RESURRECT_STAGE_LIMIT_S: '10' };
    const r = resolve({ maxSize: '7' }, env);
    expect(r).toMatchObject({ ok: true, limits: { maxSizeMiB: 7, runLimitS: 100, stageLimitS: 10 } });
  });

  it.each(['1.5', 'abc', '', '-3', '1e3', ' 4'])('rejects the non-integer value %j', (v) => {
    expect(resolve({ runLimit: v }).ok).toBe(false);
    expect(resolve({}, { SWF_RESURRECT_STAGE_LIMIT_S: v }).ok).toBe(false);
  });

  it('rejects zero from an option and from a variable', () => {
    const a = resolve({ maxSize: '0' });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message).toContain('--max-size');
    const b = resolve({}, { SWF_RESURRECT_MAX_SIZE_MIB: '0' });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.message).toContain('SWF_RESURRECT_MAX_SIZE_MIB');
  });

  it('has the weight table, and recover gets 120 s by default', () => {
    expect(STAGE_WEIGHTS).toEqual({ recover: 2, unpack: 2, convert: 1, translate: 1, emit: 1, gate: 1, verify: 3 });
    expect(defaultLimits().stageWeights).toEqual(STAGE_WEIGHTS);
    expect(stageAllowanceS(defaultLimits(), 'recover')).toBe(120);
    expect(stageAllowanceS(defaultLimits(), 'verify')).toBe(180);
  });
});

describe('CLI limit options', () => {
  it('parses the three options as text', () => {
    const r = parseArgs(['a.swf', 'out', '--max-size', '8', '--run-limit', '90', '--stage-limit', '20']);
    expect(r).toMatchObject({ ok: true, options: { maxSize: '8', runLimit: '90', stageLimit: '20' } });
  });

  it.each([['--max-size', '0'], ['--run-limit', 'x'], ['--stage-limit', '2.5']])('%s %s is a usage error (exit 2)', (name, v) => {
    const r = parseArgs(['a.swf', 'out', name, v]);
    expect(r).toMatchObject({ ok: false, exitCode: 2 });
    if (!r.ok) expect(r.message).toContain(name);
  });
});
