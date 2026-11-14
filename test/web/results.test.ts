import { describe, expect, it } from 'vitest';
import { summariseResults } from '../../web/server/results';

const fidelityCompared = {
  visual: {
    status: 'compared',
    overallMatch: 100,
    comparedFrames: 3,
    notComparedFrames: 0,
    frames: [{ frame: 1, status: 'compared', matchPercent: 100 }],
  },
  behaviour: { status: 'compared', traceScore: 100, matched: 676, referenceLineCount: 676 },
};

const translation = {
  classes: [
    { className: 'A', status: 'clean', omitted: false, overridden: false, diagnostics: [], typeErrors: [] },
    { className: 'B', status: 'loose', omitted: false, overridden: false, diagnostics: [{}, {}], typeErrors: [{}] },
    { className: 'C', status: 'unsupported', omitted: true, overridden: false, diagnostics: [{}], typeErrors: [] },
  ],
  classPaths: [{ className: 'A', path: 'src/A.ts' }],
  otherErrors: [{}],
};

describe('summariseResults', () => {
  it('summarises compared scores, class counts and unsupported entries', () => {
    const r = summariseResults(fidelityCompared, translation, {
      entries: [{ kind: 'filter', id: 7, message: 'Drop shadow filter ignored' }],
    });
    expect(r.overallMatch).toEqual({ value: 100, reasons: [], basis: '3 of 3 sampled frames compared' });
    expect(r.traceScore).toEqual({ value: 100, reasons: [], basis: '676 of 676 reference trace lines matched' });
    expect(r.classCounts).toEqual({ total: 3, clean: 1, loose: 1, unsupported: 1, omitted: 1, overridden: 0, typeErrors: 2 });
    expect(r.classes[0]).toEqual({
      className: 'A',
      status: 'clean',
      omitted: false,
      overridden: false,
      path: 'src/A.ts',
      diagnostics: 0,
      typeErrors: 0,
    });
    expect(r.classes[1].path).toBeNull();
    expect(r.unsupported).toEqual([{ kind: 'filter', message: 'Drop shadow filter ignored', id: 7, tag: null }]);
  });

  it('gives the reasons when scores are not compared', () => {
    const r = summariseResults(
      {
        visual: {
          overallMatch: null,
          comparedFrames: 0,
          notComparedFrames: 2,
          frames: [
            { frame: 1, status: 'not-compared', reason: 'render-failed' },
            { frame: 2, status: 'not-compared', reason: 'render-failed' },
          ],
        },
        behaviour: { status: 'not-compared', reason: 'no-reference-trace' },
      },
      undefined,
      undefined,
    );
    expect(r.overallMatch).toEqual({ value: null, reasons: ['render-failed'], basis: '0 of 2 sampled frames compared' });
    expect(r.traceScore).toEqual({ value: null, reasons: ['no-reference-trace'], basis: null });
    expect(r.classCounts).toBeNull();
    expect(r.unsupported).toBeNull();
  });

  it('survives missing and malformed files', () => {
    expect(summariseResults(undefined, undefined, undefined)).toEqual({
      overallMatch: null,
      traceScore: null,
      classCounts: null,
      classes: [],
      unsupported: null,
    });
    const r = summariseResults({ visual: [], behaviour: 'x' }, { classes: 'nope' }, { entries: [null, 3] });
    expect(r.overallMatch).toBeNull();
    expect(r.traceScore).toBeNull();
    expect(r.classCounts?.total).toBe(0);
    expect(r.unsupported).toEqual([]);
    const v = summariseResults({ visual: { overallMatch: null, frames: [] } }, null, null);
    expect(v.overallMatch?.reasons).toEqual(['no-frames-compared']);
  });
});
