import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultHandwrittenDir, parseArgs } from '../../src/pipeline/cli';

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
