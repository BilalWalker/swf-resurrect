import { describe, expect, it } from 'vitest';
import { flashApiGapProblems } from '../../src/translate/report';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { summariseGaps } from '../../src/outcome/gaps';

function gapsOf(imports: string, body: string) {
  const src = `package\n{\n  ${imports}\n  public class A\n  {\n${body}\n  }\n}\n`;
  return translateCore(src, { shimNames: SHIM_AS3_NAMES, selfQualified: 'A', siblingClasses: new Set(['A']), syntaxCheck: tsSyntaxCheck }).flashApiGaps ?? [];
}

describe('flash-api-gap (Requirement 17.5)', () => {
  it('names a class with policy gap', () => {
    const g = gapsOf('import flash.utils.ByteArray;', '    public var b:ByteArray;');
    expect(g).toEqual([{ qualified: 'flash.utils.ByteArray', line: 6 }]);
  });

  it('names a Flash class that is neither in the Shim nor in the table', () => {
    const g = gapsOf('import flash.ui.Mouse;', '    public function f():void { Mouse.hide(); }');
    expect(g.map((u) => u.qualified)).toEqual(['flash.ui.Mouse']);
    expect(g[0].member).toBeUndefined();
  });

  it('names a member that a stub entry does not list, and not a listed or inherited one', () => {
    const g = gapsOf(
      'import flash.media.Sound;',
      '    public function f(s:Sound):void { s.play(); s.addEventListener("x", null); s.extract(); }',
    );
    expect(g).toEqual([{ qualified: 'flash.media.Sound', member: 'extract', line: 6 }]);
  });

  it('reports nothing for a Shim class, a stub class used by its members, or an unused import', () => {
    expect(gapsOf('import flash.display.Sprite;', '    public var s:Sprite;')).toEqual([]);
    expect(gapsOf('import flash.media.Sound;', '    public function f(s:Sound):void { s.play(); }')).toEqual([]);
    expect(gapsOf('import flash.ui.Mouse;', '    public var n:int;')).toEqual([]);
  });

  it('becomes a flash-api-gap problem and a counted Outcome gap, with no stub', () => {
    const cls = { className: 'A', flashApiGaps: [{ qualified: 'flash.utils.ByteArray', line: 4 }] } as unknown as TranslatedClass;
    const problems = flashApiGapProblems([cls], new Set());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: 'flash-api-gap', className: 'A', flashClass: 'flash.utils.ByteArray' });
    expect(flashApiGapProblems([cls], new Set(['A']))).toEqual([]);
    const gaps = summariseGaps(problems.map((p) => ({ kind: p.kind, example: p.message })));
    expect(gaps).toMatchObject([{ kind: 'flash-api-gap', count: 1 }]);
  });
});

