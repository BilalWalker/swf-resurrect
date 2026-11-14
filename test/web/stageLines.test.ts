import { describe, expect, it } from 'vitest';
import { parseLine, redactPaths, splitLines } from '../../web/server/stageLines';

describe('parseLine', () => {
  it('parses the stage lines of a successful run (clickgoto)', () => {
    expect(parseLine('[unpack] ok')).toEqual({ type: 'stage-ok', stage: 'unpack', detail: null, facts: {} });
    expect(parseLine('[convert] ok (4 svg written, 0 morph skipped)')).toEqual({
      type: 'stage-ok',
      stage: 'convert',
      detail: '4 svg written, 0 morph skipped',
      facts: { svgWritten: 4, morphSkipped: 0 },
    });
    expect(parseLine('[translate] ok (4 classes: 1 clean, 3 loose, 0 unsupported)')).toEqual({
      type: 'stage-ok',
      stage: 'translate',
      detail: '4 classes: 1 clean, 3 loose, 0 unsupported',
      facts: { classes: 4, clean: 1, loose: 3, unsupported: 0 },
    });
    expect(parseLine('[emit] ok')).toMatchObject({ type: 'stage-ok', stage: 'emit' });
    expect(parseLine('[typecheck] ok (0 errors)')).toEqual({
      type: 'stage-ok',
      stage: 'typecheck',
      detail: '0 errors',
      facts: { errors: 0 },
    });
    expect(parseLine('Done: D:\\x\\out')).toEqual({ type: 'done' });
  });

  it('parses the verify line with numbers and with not-compared', () => {
    expect(
      parseLine('[verify] overall match 100.00%, trace score 97.50% -> D:\\a\\fidelity-report.json, D:\\a\\fidelity-report.html'),
    ).toEqual({ type: 'verify', overallMatch: 100, traceScore: 97.5 });
    expect(parseLine('[verify] overall match 88.31%, trace score not-compared -> /a/f.json, /a/f.html')).toEqual({
      type: 'verify',
      overallMatch: 88.31,
      traceScore: null,
    });
    expect(parseLine('[verify] overall match not-compared, trace score not-compared -> x, y')).toMatchObject({
      overallMatch: null,
      traceScore: null,
    });
    expect(parseLine('  trace: 3 missing, 1 extra')).toEqual({ type: 'verify-trace', missing: 3, extra: 1 });
    expect(parseLine('  input note: click at 10,20 released outside')).toEqual({
      type: 'verify-note',
      text: 'click at 10,20 released outside',
    });
  });

  it('parses type errors, warnings and errors', () => {
    expect(parseLine('[typecheck] 3 errors: src/A.ts (2), src/B.ts (1)')).toEqual({
      type: 'typecheck-errors',
      count: 3,
      detail: 'src/A.ts (2), src/B.ts (1)',
    });
    expect(parseLine('[typecheck] 1 error: src/A.ts (1)')).toMatchObject({ type: 'typecheck-errors', count: 1 });
    expect(parseLine('warn [emit]: the bundler guard could not run')).toEqual({
      type: 'warn',
      stage: 'emit',
      message: 'the bundler guard could not run',
    });
    expect(parseLine('error [unpack]: FFDec exited with code 1')).toEqual({
      type: 'error',
      stage: 'unpack',
      message: 'FFDec exited with code 1',
    });
    expect(parseLine('error [pipeline]: SWF file is missing or not readable: x')).toMatchObject({
      type: 'error',
      stage: 'pipeline',
    });
  });

  it('treats anything else as a log line, including Windows line ends', () => {
    expect(parseLine('[unpack] ok\r')).toMatchObject({ type: 'stage-ok', stage: 'unpack' });
    expect(parseLine('[bogus] ok')).toEqual({ type: 'log' });
    expect(parseLine('translation report:')).toEqual({ type: 'log' });
    expect(parseLine('')).toEqual({ type: 'log' });
  });
});

describe('splitLines', () => {
  it('keeps unfinished text for the next chunk', () => {
    let rest = '';
    const all: string[] = [];
    for (const chunk of ['[unp', 'ack] ok\r\n[conv', 'ert] ok (1 svg written, 0 morph skipped)\n', 'Done']) {
      const r = splitLines(rest, chunk);
      all.push(...r.lines);
      rest = r.rest;
    }
    expect(all).toEqual(['[unpack] ok', '[convert] ok (1 svg written, 0 morph skipped)']);
    expect(rest).toBe('Done');
  });
});

describe('redactPaths', () => {
  it('replaces paths in both slash styles, case-insensitively, longest first', () => {
    const text = 'Done: D:\\Repo\\.work\\web-runs\\abc\\out and d:/repo/src/x.ts';
    expect(
      redactPaths(text, [
        ['D:\\Repo', '<repo>'],
        ['D:\\Repo\\.work\\web-runs\\abc', '<job>'],
      ]),
    ).toBe('Done: <job>\\out and <repo>/src/x.ts');
  });
});
