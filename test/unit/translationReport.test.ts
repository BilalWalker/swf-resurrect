import { describe, expect, it } from 'vitest';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { untranslatedCodeEntries } from '../../src/translate/report';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import type { TranslateOptions } from '../../src/translate/types';

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'A',
  siblingClasses: new Set(['A']),
  syntaxCheck: tsSyntaxCheck,
};

/** A class `A` whose members are `members`; returns the Diagnostics and the report entries of the unsupported ones. */
function report(members: string) {
  const r = translateCore(`package\n{\n  public class A\n  {\n${members}\n  }\n}\n`, options);
  const entries = untranslatedCodeEntries([{ className: 'A', diagnostics: r.diagnostics } as unknown as TranslatedClass], new Set());
  return { r, entries };
}
const method = (body: string) => `    public function m(x:*, k:*):void\n    {\n${body}\n    }`;

describe('Translation_Report names the commented-out construct, class and line', () => {
  const cases: Array<[string, string]> = [
    ['delete', method('      delete k;')],
    ['flash_proxy', '    flash_proxy override function getProperty(name:*):* { return 1; }'],
    ['is Array', method('      switch (x)\n      {\n        case 1:\n          var b:Boolean = k is Array;\n      }')],
    ['Dictionary', method('      try\n      {\n        var d:Dictionary = null;\n      }\n      catch (e:Error)\n      {\n      }')],
    ['Class', method('      with (x)\n      {\n        var c:Class = k;\n      }')],
  ];
  for (const [word, members] of cases) {
    it(`names "${word}" with the class and the line`, () => {
      const { r, entries } = report(members);
      const hits = r.diagnostics.filter((d) => d.kind === 'unsupported-construct' && d.message.includes(word));
      expect(hits.length).toBeGreaterThan(0);
      expect(r.text).toContain('// AS3:');
      const e = entries.find((x) => x.message.includes(word));
      expect(e).toBeDefined();
      expect(e?.kind).toBe('untranslated-code');
      expect(e?.tag).toBe('A');
      expect(e?.message).toMatch(/^line \d+: /);
    });
  }

  it('does not repeat a word the reason already names', () => {
    const { r } = report(method('      delete k;'));
    const d = r.diagnostics.find((x) => x.kind === 'unsupported-construct');
    expect((d?.message ?? '').split('delete').length - 1).toBe(1);
  });

  it('leaves a translatable delete, is Array and Vector copy out of the report', () => {
    const { r, entries } = report(method('      delete x[k];\n      var a:Boolean = x is Array;\n      var v:Vector.<int> = Vector.<int>(x);'));
    expect(r.diagnostics.filter((d) => d.kind === 'unsupported-construct')).toEqual([]);
    expect(entries).toEqual([]);
  });
});
