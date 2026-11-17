// flash.utils.Proxy stays unsupported (as3-coverage Requirement 20). Fixture_Classes only.
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { decideClassOmissions, omissionMessage, type OmissionClass } from '../../src/emit/classOmissions';
import { classifyOverrides } from '../../src/pipeline/handwrittenSet';
import { planTranslate } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

const scene = { formatVersion: 1, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frames: [], labels: {}, className: 'Keys' } } } as unknown as SceneJson;
const keys = (head: string, imports: string): string =>
  `package {\n${imports}  public class Keys extends ${head} {\n    public function Keys() {\n    }\n  }\n}\n`;

function plan(head: string, imports: string) {
  const cls = planTranslate([{ className: 'Keys', source: keys(head, imports) }], scene, tsSyntaxCheck).classes[0];
  if (!cls) throw new Error('no class');
  return cls;
}
const asOmission = (unsupportedBase: string | undefined, handwritten: boolean): OmissionClass => ({
  className: 'Keys', path: 'src/Keys.ts', extendsQualified: null, importsQualified: [], handwritten, produced: true,
  ...(unsupportedBase === undefined ? {} : { unsupportedBase }),
});

describe('a class that extends flash.utils.Proxy', () => {
  for (const [label, head, imports] of [
    ['imported', 'Proxy', '  import flash.utils.Proxy;\n'],
    ['qualified', 'flash.utils.Proxy', ''],
  ] as const) {
    it(`is named as an unsupported base and left out of the registry (${label})`, () => {
      const cls = plan(head, imports);
      expect(cls.unsupportedBase).toBe('flash.utils.Proxy');
      const [o] = decideClassOmissions([], [asOmission(cls.unsupportedBase, false)], []);
      expect(o?.reason).toEqual({ kind: 'unsupported-base', base: 'flash.utils.Proxy' });
      expect(omissionMessage(o as NonNullable<typeof o>)).toContain('extends flash.utils.Proxy, an unsupported base class');
    });
    it(`never binds Proxy to the JavaScript global (${label})`, () => {
      const text = plan(head, imports).text;
      expect(text).not.toMatch(/extends\s+Proxy\b/);
      expect(text).not.toMatch(/\bProxy\b.*from/);
    });
  }
  it('is not omitted when a Hand_Written_Class replaces it, and the report lists it as hand-written', () => {
    expect(decideClassOmissions([], [asOmission('flash.utils.Proxy', true)], [])).toEqual([]);
    const set = [{ sample: 's', className: 'Keys', reason: 'extends flash.utils.Proxy' }];
    expect(classifyOverrides('s', ['Keys'], set, new Set(['Keys'])).listed).toEqual([
      { className: 'Keys', reason: 'extends flash.utils.Proxy', replacesTranslated: true },
    ]);
  });
  it('leaves a class that extends a source class named Proxy alone', () => {
    const files = [
      { className: 'Proxy', source: 'package {\n  public class Proxy {\n  }\n}\n' },
      { className: 'Keys', source: keys('Proxy', '') },
    ];
    const keysClass = planTranslate(files, scene, tsSyntaxCheck).classes.find((c) => c.className === 'Keys');
    expect(keysClass?.unsupportedBase).toBeUndefined();
  });
});
