import { describe, it, expect } from 'vitest';
import { renderFidelityHtml } from '../../src/verify/core/html';
import type { FidelityReport } from '../../src/verify/core/report';

function baseReport(behaviour: FidelityReport['behaviour']): FidelityReport {
  return {
    sample: 's',
    stage: { width: 10, height: 10 },
    tools: { ffdec: '1', playwright: '2', pngjs: '3' },
    tolerance: { background: '#ffffff', strict: 8, edgeMax: 128, edgeContrast: 48, neighbourhood: '3x3' },
    visual: { overallMatch: null, comparedFrames: 0, notComparedFrames: 0, frames: [], knownVisualLimits: [] },
    behaviour,
    problems: [],
    translation: { typeCheck: 'ran', classes: [] },
  } as unknown as FidelityReport;
}

const NONE = '<h3>Known behaviour gaps</h3>\n<p>none</p>';

describe('html known behaviour gaps', () => {
  it('prints none for an empty list when not compared', () => {
    const html = renderFidelityHtml(
      baseReport({ status: 'not-compared', reason: 'no-reference-trace', knownBehaviourGaps: [] } as never),
    );
    expect(html).toContain(NONE);
  });

  it('prints none for an empty list when compared', () => {
    const html = renderFidelityHtml(
      baseReport({
        status: 'compared',
        traceScore: 100,
        firstDivergence: null,
        missing: [],
        extra: [],
        referenceLineCount: 0,
        capturedLineCount: 0,
        matched: 0,
        replay: { ticks: 0, inputGroups: 0, clicks: 0, pointerEvents: 0 },
        knownBehaviourGaps: [],
      } as never),
    );
    expect(html).toContain(NONE);
  });

  it('renders escaped codes for a non-empty list', () => {
    const html = renderFidelityHtml(
      baseReport({ status: 'not-compared', reason: 'no-reference-trace', knownBehaviourGaps: ['a<b', 'x&y'] } as never),
    );
    expect(html).toContain('<h3>Known behaviour gaps</h3>\n<ul>\n<li>a&lt;b</li>\n<li>x&amp;y</li>\n</ul>');
    expect(html).not.toContain(NONE);
  });
});
