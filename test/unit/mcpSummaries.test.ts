import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayPath, OutsideRepoError, resolveInsideRepo } from '../../mcp/swf-inspector/paths';
import {
  classNameOfScript,
  renderReportSummary,
  scriptPathOfClass,
  summariseDump,
} from '../../mcp/swf-inspector/summaries';

describe('resolveInsideRepo', () => {
  const root = path.win32.resolve('C:\\repo');
  it('resolves relative paths under the root', () => {
    expect(resolveInsideRepo(root, 'samples/a/test.swf', path.win32)).toBe('C:\\repo\\samples\\a\\test.swf');
    expect(resolveInsideRepo(root, '.', path.win32)).toBe('C:\\repo');
  });
  it.each(['..', '../x', 'a/../../x', 'C:\\other\\x', 'D:\\repo\\x', '\\\\server\\share\\x', 'a\0b'])(
    'rejects %j on Windows',
    (given) => {
      expect(() => resolveInsideRepo(root, given, path.win32)).toThrow(OutsideRepoError);
    },
  );
  it.each(['..', '../x', '/etc/passwd', 'a/../../x'])('rejects %j on POSIX', (given) => {
    expect(() => resolveInsideRepo('/repo', given, path.posix)).toThrow(OutsideRepoError);
  });
  it('accepts an absolute path that is inside the root', () => {
    expect(resolveInsideRepo('/repo', '/repo/out/x', path.posix)).toBe('/repo/out/x');
  });
  it('displayPath uses forward slashes', () => {
    expect(displayPath(root, 'C:\\repo\\samples\\a\\test.swf', path.win32)).toBe('samples/a/test.swf');
  });
});

describe('summaries', () => {
  it('summarises the clickgoto dump', async () => {
    const xml = await readFile('test/fixtures/clickgoto/structure.xml', 'utf8');
    const s = summariseDump(xml);
    expect(s).toMatchObject({
      ffdecVersion: '26.4.0',
      swfVersion: 43,
      frameCount: 3,
      frameRate: 24,
      compression: 'ZLIB',
      stage: { width: 550, height: 400 },
      actionScript3: true,
      hasSymbolClass: true,
      classCount: 4,
    });
    const count = (type: string) => s.tags.find((t) => t.type === type)?.count;
    expect(count('ShowFrameTag')).toBe(7);
    expect(count('PlaceObject2Tag')).toBe(6);
    expect(s.tags.every((t) => t.type.endsWith('Tag'))).toBe(true);
    // Sorted by count, largest first.
    expect(s.tags.map((t) => t.count)).toEqual([...s.tags.map((t) => t.count)].sort((a, b) => b - a));
  });

  it('reports unknowns as null instead of guessing', () => {
    const s = summariseDump('<swf></swf>');
    expect(s).toMatchObject({ swfVersion: null, stage: null, actionScript3: false, hasSymbolClass: false, tags: [] });
  });

  it('maps script paths and class names both ways and refuses path tricks', () => {
    expect(classNameOfScript('fl\\controls\\Slider.as')).toBe('fl.controls.Slider');
    expect(scriptPathOfClass('fl.controls.Slider')).toBe('fl/controls/Slider.as');
    expect(scriptPathOfClass('Main')).toBe('Main.as');
    for (const bad of ['../x', 'a/b', 'a..b', '.a', 'a.', '', 'a b']) expect(scriptPathOfClass(bad)).toBeNull();
  });

  it('renders scores, the lowest frames and class counts from the reports', () => {
    const text = renderReportSummary('out/x', {
      fidelity: {
        sample: 'x',
        visual: {
          status: 'compared',
          overallMatch: 99.5,
          comparedFrames: 2,
          notComparedFrames: 0,
          frames: [
            { frame: 1, status: 'compared', matchPercent: 100 },
            { frame: 2, status: 'compared', matchPercent: 99 },
          ],
          knownVisualLimits: ['dynamic text is not drawn'],
        },
        behaviour: { status: 'not-compared', reason: 'no-reference-trace', knownBehaviourGaps: [] },
        problems: [],
      },
      translation: {
        typeCheck: 'ran',
        classes: [
          { className: 'A', status: 'clean' },
          { className: 'B', status: 'loose' },
          { className: 'C', status: 'loose' },
        ],
        otherErrors: [],
      },
      unsupported: null,
    });
    expect(text).toContain('Overall_Match: 99.50%');
    expect(text).toContain('Trace_Score: not-compared (no-reference-trace)');
    expect(text).toContain('frame 2: 99.00%');
    expect(text).not.toContain('frame 1:');
    expect(text).toContain('dynamic text is not drawn');
    expect(text).toContain('clean: 1 (A)');
    expect(text).toContain('loose: 2 (B, C)');
    expect(text).toContain('unsupported-features.json: not found');
  });

  it('names missing report files', () => {
    const text = renderReportSummary('out/x', { fidelity: null, translation: null, unsupported: null });
    expect(text).toContain('fidelity-report.json: not found');
    expect(text).toContain('translation-report.json: not found');
  });
});

