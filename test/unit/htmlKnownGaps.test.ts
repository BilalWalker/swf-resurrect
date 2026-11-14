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
        replay: { ticks: 0, inputGroups: 0, clicks: 0, pointerEvents: 0, inputNotes: [] },
        knownBehaviourGaps: [],
      } as never),
    );
    expect(html).toContain(NONE);
  });

  it('prints the text of the empty-reference-trace reason', () => {
    const html = renderFidelityHtml(
      baseReport({ status: 'not-compared', reason: 'empty-reference-trace', knownBehaviourGaps: [] } as never),
    );
    expect(html).toContain('Not compared (reference trace is empty; no Trace_Score)');
  });

  it('renders escaped codes for a non-empty list', () => {
    const html = renderFidelityHtml(
      baseReport({ status: 'not-compared', reason: 'no-reference-trace', knownBehaviourGaps: ['a<b', 'x&y'] } as never),
    );
    expect(html).toContain('<h3>Known behaviour gaps</h3>\n<ul>\n<li>a&lt;b</li>\n<li>x&amp;y</li>\n</ul>');
    expect(html).not.toContain(NONE);
  });

  it('renders input notes as one escaped table', () => {
    const html = renderFidelityHtml(
      baseReport({
        status: 'compared',
        traceScore: 50,
        firstDivergence: null,
        missing: [],
        extra: [],
        referenceLineCount: 0,
        capturedLineCount: 0,
        matched: 0,
        replay: {
          ticks: 0,
          inputGroups: 0,
          clicks: 0,
          pointerEvents: 0,
          inputNotes: [
            { kind: 'release-outside', index: 21, downIndex: 17, pressed: 'root1.<b>', hit: 'stage' },
            { kind: 'unsupported-input', index: 30, detail: 'a&b' },
          ],
        },
        knownBehaviourGaps: [],
      } as never),
    );
    expect(html.match(/<table>\n<caption>Replay input entries/g)).toHaveLength(1);
    expect(html).toContain('<h3>Input notes (2)</h3>');
    expect(html).toContain('<th scope="col">Kind</th><th scope="col">Entry</th>');
    expect(html).toContain('<td>release-outside</td><td>21</td><td>pressed root1.&lt;b&gt;, released over stage; MouseDown at entry 17</td>');
    expect(html).toContain('<td>a&amp;b</td>');
    expect(html).not.toContain('<b>');
  });

  it('renders the Caught_Errors count and the listed errors, escaped', () => {
    const compared = (caughtErrors?: unknown): FidelityReport =>
      baseReport({
        status: 'compared',
        traceScore: 100,
        firstDivergence: null,
        missing: [],
        extra: [],
        referenceLineCount: 0,
        capturedLineCount: 0,
        matched: 0,
        replay: { ticks: 0, inputGroups: 0, clicks: 0, pointerEvents: 0, inputNotes: [], caughtErrors },
        knownBehaviourGaps: [],
      } as never);
    const html = renderFidelityHtml(compared({ count: 25, first: [{ tick: 3, site: 'constructor <A>', message: 'a&b' }] }));
    expect(html).toContain('<h3>Caught errors (25)</h3>');
    expect(html).toContain('<td>3</td><td>constructor &lt;A&gt;</td><td>a&amp;b</td>');
    expect(html).not.toContain('<A>');
    expect(renderFidelityHtml(compared({ count: 0, first: [] }))).toContain('<h3>Caught errors (0)</h3>\n<p>none</p>');
    expect(renderFidelityHtml(compared(undefined))).toContain('<h3>Caught errors (0)</h3>');
  });
});

describe('html known visual limits', () => {
  it('prints the new kinds generically and escapes id-less and id messages', () => {
    const r = baseReport({ status: 'not-compared', reason: 'no-reference-trace', knownBehaviourGaps: [] } as never);
    (r.visual as { knownVisualLimits: unknown[] }).knownVisualLimits = [
      { kind: 'gradient-fill', id: 7, message: 'a<b>&c' },
      { kind: 'text-metrics', message: 'x"y' },
    ];
    const html = renderFidelityHtml(r);
    expect(html).toContain('<li>gradient-fill (id 7): a&lt;b&gt;&amp;c</li>');
    expect(html).toContain('<li>text-metrics: x&quot;y</li>');
    expect(html).not.toContain('<b>');
  });
});
describe('html residual regions', () => {
  it('prints the regions table per frame and the three counts, escaped', () => {
    const report = baseReport({ status: 'not-compared', reason: 'no-reference-trace', knownBehaviourGaps: [] } as never);
    (report.visual as unknown as Record<string, unknown>)['residual'] = { regions: 3, attributed: 1, unattributed: 2 };
    (report.visual as unknown as Record<string, unknown>)['frames'] = [
      {
        frame: 2,
        status: 'compared',
        matchPercent: 99.5,
        differingPixels: 5,
        totalPixels: 100,
        images: { reference: 'a<b.png', rendered: 'r.png', diff: 'd.png' },
        regions: {
          rows: [{ id: 1, bbox: { x0: 0, y0: 1, x1: 2, y1: 3 }, pixels: 4, first: { x: 0, y: 1 } }],
          omitted: { regions: 2, pixels: 1 },
        },
      },
    ];
    const html = renderFidelityHtml(report);
    expect(html).toContain('Differing regions: 3, attributed: 1, unattributed: 2');
    expect(html).toContain('<caption>Differing regions of frame 2</caption>');
    expect(html).toContain('<tr><td>1</td><td>0,1-2,3</td><td>4</td></tr>');
    expect(html).toContain('<tr><td colspan="2">2 more regions</td><td>1</td></tr>');
    expect(html).toContain('a&lt;b.png');
  });
});