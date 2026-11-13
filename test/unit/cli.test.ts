import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultHandwrittenDir, parseArgs } from '../../src/pipeline/cli';
import { verifyLines } from '../../src/pipeline/pipeline';

describe('parseArgs', () => {
  it('parses positionals with defaults', () => {
    const r = parseArgs(['a.swf', 'out']);
    expect(r).toEqual({
      ok: true,
      options: { swfPath: 'a.swf', outputDir: 'out', force: false, keepWork: false },
    });
  });

  it('parses all options', () => {
    const r = parseArgs([
      'a.swf', 'out', '--force', '--keep-work', '--work-dir', 'w', '--ffdec', 'j.jar', '--handwritten', 'h',
    ]);
    expect(r).toEqual({
      ok: true,
      options: {
        swfPath: 'a.swf', outputDir: 'out', force: true, keepWork: true,
        workDir: 'w', ffdecJarPath: 'j.jar', handwrittenDir: 'h',
      },
    });
  });

  it.each([
    [[]],
    [['a.swf']],
    [['a.swf', 'out', 'extra']],
    [['a.swf', 'out', '--bogus']],
    [['a.swf', 'out', '--work-dir']],
    [['a.swf', 'out', '--ffdec', '']],
  ])('usage error -> exit 2: %j', (argv) => {
    const r = parseArgs(argv);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.exitCode).toBe(2);
      expect(r.message).toContain('Usage:');
    }
  });
});

describe('defaultHandwrittenDir', () => {
  it('uses the SWF parent directory name', () => {
    expect(defaultHandwrittenDir('/repo', 'samples/clickgoto/test.swf')).toBe(join('/repo', 'handwritten', 'clickgoto'));
    expect(defaultHandwrittenDir('/repo', resolve('x/other/f.swf'))).toBe(join('/repo', 'handwritten', 'other'));
  });
});

describe('verifyLines', () => {
  const base = { overallMatch: 99.5, traceScore: 100, missing: 0, extra: 0, inputNoteLines: [], jsonPath: 'j', htmlPath: 'h' };

  it('prints only the [verify] line at Trace_Score 100', () => {
    expect(verifyLines({ ...base, inputNoteLines: ['x'] })).toEqual([
      '[verify] overall match 99.50%, trace score 100.00% -> j, h',
    ]);
  });

  it('prints counts and note lines below 100', () => {
    const lines = verifyLines({
      ...base,
      traceScore: 80,
      missing: 2,
      extra: 1,
      inputNoteLines: ['release-outside at entry 21 (pressed root1.a, released over stage; MouseDown at entry 17)'],
    });
    expect(lines).toEqual([
      '[verify] overall match 99.50%, trace score 80.00% -> j, h',
      '  trace: 2 missing, 1 extra',
      '  input note: release-outside at entry 21 (pressed root1.a, released over stage; MouseDown at entry 17)',
    ]);
  });

  it('prints one line when not compared', () => {
    expect(verifyLines({ ...base, traceScore: null })).toHaveLength(1);
  });
});
