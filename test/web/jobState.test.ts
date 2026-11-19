import { describe, expect, it } from 'vitest';
import { abort, applyLine, buildFinished, currentStage, initialState, pipelineExited, start } from '../../web/server/jobState';
import type { JobState } from '../../web/server/jobState';
import { parseLine } from '../../web/server/stageLines';
import type { JobOutcome, OutcomeRead } from '../../web/server/outcome';

function read(outcome: JobOutcome['outcome'], over: Partial<JobOutcome> = {}): OutcomeRead {
  return {
    ok: true,
    outcome: {
      outcome,
      reasonCode: null,
      reason: 'a sentence',
      numbers: null,
      gaps: [],
      facts: null,
      obfuscation: null,
      referenceId: null,
      runLimitS: 300,
      embeddedSwfs: null,
      ...over,
    },
  };
}
const CONVERTED = read('converted');

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
    s = pipelineExited(s, 0, undefined, CONVERTED);
    expect(currentStage(s)).toBe('build');
    expect(s.status).toBe('running');
    s = buildFinished(s, null);
    expect(s.status).toBe('succeeded');
    expect(s.stages.every((x) => x.status === 'ok')).toBe(true);
  });

  it('marks verify skipped when the run had no verify line', () => {
    const s = pipelineExited(feed(start(initialState()), SUCCESS.slice(0, 5)), 0, undefined, CONVERTED);
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
    const s = buildFinished(pipelineExited(feed(start(initialState()), SUCCESS), 0, undefined, CONVERTED), 'vite failed');
    expect(s.status).toBe('succeeded');
    expect(s.stages[6]).toMatchObject({ status: 'failed', detail: 'vite failed' });
  });

  it('aborts queued and running jobs, but not finished ones', () => {
    expect(abort(initialState(), 'server stopped')).toMatchObject({ status: 'failed', error: { stage: 'unpack' } });
    const done = buildFinished(pipelineExited(feed(start(initialState()), SUCCESS), 0, undefined, CONVERTED), null);
    expect(abort(done, 'x')).toBe(done);
    const building = pipelineExited(feed(start(initialState()), SUCCESS), 0, undefined, CONVERTED);
    expect(abort(building, 'stopped').error?.stage).toBe('build');
  });

  it('ends a refused run as refused, not failed, even after an error line', () => {
    const refused = read('refused', { reasonCode: 'damaged', reason: 'the file could not be read' });
    const s = pipelineExited(feed(start(initialState()), ['error [unpack]: the file could not be read']), 3, undefined, refused);
    expect(s.status).toBe('refused');
    expect(s.error).toBeNull();
    expect(s.outcome).toMatchObject({ outcome: 'refused', reasonCode: 'damaged' });
    expect(s.stages.find((x) => x.key === 'build')?.status).toBe('skipped');
    expect(currentStage(s)).toBeNull();
    expect(abort(s, 'x')).toBe(s);
    // The stage where it was refused is neutral, never `failed`.
    expect(s.stages.find((x) => x.key === 'unpack')?.status).toBe('refused');
    expect(s.stages.some((x) => x.status === 'failed')).toBe(false);
  });

  it('marks the running stage as refused when no error line came first', () => {
    const s = pipelineExited(feed(start(initialState()), ['[unpack] ok']), 3, undefined, read('refused', { reasonCode: 'time-limit' }));
    expect(statuses(s)).toBe('unpack:ok convert:refused translate:skipped emit:skipped typecheck:skipped verify:skipped build:skipped');
  });

  it('keeps a converted-with-gaps outcome through the build', () => {
    const gaps = read('converted-with-gaps', { numbers: null });
    const s = buildFinished(pipelineExited(feed(start(initialState()), SUCCESS), 0, undefined, gaps), null);
    expect(s.status).toBe('succeeded');
    expect(s.outcome?.outcome).toBe('converted-with-gaps');
  });

  it('fails with the engine sentence and reference id when the run failed', () => {
    const failed = read('failed', { reasonCode: 'internal-error', reason: 'an internal error stopped the run (reference 3fa9c01e)', referenceId: '3fa9c01e' });
    const s = pipelineExited(feed(start(initialState()), ['[unpack] ok', 'error [pipeline]: internal error, reference 3fa9c01e']), 1, undefined, failed);
    expect(s.status).toBe('failed');
    expect(s.error?.message).toBe('an internal error stopped the run (reference 3fa9c01e)');
    expect(s.outcome?.referenceId).toBe('3fa9c01e');
  });

  it('fails with a plain sentence when exit 0 or 3 left no readable outcome file', () => {
    const missing: OutcomeRead = { ok: false, message: 'the converter ended without writing its result record' };
    for (const code of [0, 3]) {
      const s = pipelineExited(start(initialState()), code, undefined, missing);
      expect(s.status).toBe('failed');
      expect(s.error?.message).toBe('the converter ended without writing its result record');
      expect(s.outcome).toBeNull();
    }
  });

  it('fails when the exit code and the outcome disagree', () => {
    expect(pipelineExited(start(initialState()), 0, undefined, read('refused')).status).toBe('failed');
    expect(pipelineExited(start(initialState()), 3, undefined, CONVERTED).status).toBe('failed');
  });

  it('lets the server kill win over the outcome file', () => {
    const s = pipelineExited(start(initialState()), null, 'ended by the server', CONVERTED);
    expect(s.status).toBe('failed');
    expect(s.error?.message).toBe('ended by the server');
  });
});
