import { describe, expect, it } from 'vitest';
import { abort, applyLine, buildFinished, currentStage, initialState, pipelineExited, start } from '../../web/server/jobState';
import type { JobState } from '../../web/server/jobState';
import { parseLine } from '../../web/server/stageLines';

function feed(state: JobState, lines: string[]): JobState {
  return lines.reduce((s, l) => applyLine(s, parseLine(l)), state);
}

const statuses = (s: JobState): string => s.stages.map((x) => `${x.key}:${x.status}`).join(' ');

const SUCCESS = [
  '[unpack] ok',
  '[convert] ok (4 svg written, 0 morph skipped)',
  '[translate] ok (4 classes: 1 clean, 3 loose, 0 unsupported)',
  '[emit] ok',
  '[typecheck] ok (0 errors)',
  '[verify] overall match 100.00%, trace score 100.00% -> a.json, a.html',
  'Done: out',
];

describe('job state machine', () => {
  it('starts queued with every stage pending', () => {
    const s = initialState();
    expect(s.status).toBe('queued');
    expect(currentStage(s)).toBeNull();
    expect(s.stages.map((x) => x.key)).toEqual(['unpack', 'convert', 'translate', 'emit', 'typecheck', 'verify', 'build']);
  });

  it('runs stages in order and ignores lines before start', () => {
    let s = applyLine(initialState(), parseLine('[unpack] ok'));
    expect(s.status).toBe('queued');
    s = start(s);
    expect(currentStage(s)).toBe('unpack');
    s = feed(s, SUCCESS.slice(0, 2));
    expect(statuses(s)).toBe(
      'unpack:ok convert:ok translate:running emit:pending typecheck:pending verify:pending build:pending',
    );
    expect(s.stages[1].facts).toEqual({ svgWritten: 4, morphSkipped: 0 });
    expect(s.stages[1].detail).toBe('4 svg written, 0 morph skipped');
  });

  it('goes through a successful run, then the preview build', () => {
    let s = feed(start(initialState()), SUCCESS);
    expect(currentStage(s)).toBeNull();
    expect(s.stages[5]).toMatchObject({
      status: 'ok',
      facts: { overallMatch: 100, traceScore: 100 },
      detail: 'overall match 100.00%, trace score 100.00%',
    });
    s = pipelineExited(s, 0);
    expect(currentStage(s)).toBe('build');
    expect(s.status).toBe('running');
    s = buildFinished(s, null);
    expect(s.status).toBe('succeeded');
    expect(s.stages.every((x) => x.status === 'ok')).toBe(true);
  });

  it('marks verify skipped when the run had no verify line', () => {
    const s = pipelineExited(feed(start(initialState()), SUCCESS.slice(0, 5)), 0);
    expect(s.stages[5].status).toBe('skipped');
    expect(currentStage(s)).toBe('build');
  });

  it('keeps type errors as a warning, not a failure', () => {
    const s = feed(start(initialState()), [...SUCCESS.slice(0, 4), '[typecheck] 2 errors: src/A.ts (2)']);
    expect(s.status).toBe('running');
    expect(s.stages[4]).toMatchObject({ status: 'warn', facts: { errors: 2 }, detail: '2 errors: src/A.ts (2)' });
    expect(currentStage(s)).toBe('verify');
  });

  it('records verify trace counts and input notes', () => {
    const s = feed(start(initialState()), [
      ...SUCCESS.slice(0, 5),
      '[verify] overall match 90.00%, trace score 50.00% -> a, b',
      '  trace: 2 missing, 1 extra',
      '  input note: one',
    ]);
    expect(s.stages[5].facts).toEqual({ overallMatch: 90, traceScore: 50, missing: 2, extra: 1 });
    expect(s.verifyNotes).toEqual(['one']);
  });

  it('fails on an error line, naming the stage, and skips the rest', () => {
    let s = feed(start(initialState()), ['[unpack] ok', 'error [convert]: bad shape 7']);
    expect(s.status).toBe('failed');
    expect(s.error).toEqual({ stage: 'convert', reportedStage: 'convert', message: 'bad shape 7' });
    expect(statuses(s)).toBe(
      'unpack:ok convert:failed translate:skipped emit:skipped typecheck:skipped verify:skipped build:skipped',
    );
    // Nothing changes it afterwards.
    s = pipelineExited(feed(s, ['[translate] ok (1 classes: 1 clean, 0 loose, 0 unsupported)']), 1);
    expect(s.error?.message).toBe('bad shape 7');
  });

  it('maps an error for a non-stage name onto the running stage', () => {
    const s = feed(start(initialState()), [...SUCCESS.slice(0, 4), 'error [pipeline]: disk full']);
    expect(s.error).toEqual({ stage: 'typecheck', reportedStage: 'pipeline', message: 'disk full' });
  });

  it('fails on a non-zero exit without an error line, or a timeout', () => {
    const crashed = pipelineExited(feed(start(initialState()), ['[unpack] ok']), 3);
    expect(crashed.error).toEqual({ stage: 'convert', reportedStage: null, message: 'the pipeline exited with code 3' });
    const timedOut = pipelineExited(start(initialState()), null, 'timed out after 180 s');
    expect(timedOut.error?.message).toBe('timed out after 180 s');
    expect(timedOut.error?.stage).toBe('unpack');
  });

  it('collects warnings without changing stages', () => {
    const s = feed(start(initialState()), ['[unpack] ok', 'warn [emit]: something odd']);
    expect(s.warnings).toEqual([{ stage: 'emit', message: 'something odd' }]);
    expect(currentStage(s)).toBe('convert');
  });

  it('keeps the pipeline result when only the preview build fails', () => {
    const s = buildFinished(pipelineExited(feed(start(initialState()), SUCCESS), 0), 'vite failed');
    expect(s.status).toBe('succeeded');
    expect(s.stages[6]).toMatchObject({ status: 'failed', detail: 'vite failed' });
  });

  it('aborts queued and running jobs, but not finished ones', () => {
    expect(abort(initialState(), 'server stopped')).toMatchObject({ status: 'failed', error: { stage: 'unpack' } });
    const done = buildFinished(pipelineExited(feed(start(initialState()), SUCCESS), 0), null);
    expect(abort(done, 'x')).toBe(done);
    const building = pipelineExited(feed(start(initialState()), SUCCESS), 0);
    expect(abort(building, 'stopped').error?.stage).toBe('build');
  });
});
