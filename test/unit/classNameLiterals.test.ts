// String class names (robustness task 31.2, design D-E2). Fixture_Classes only.
// Validates: Requirements 27.5, 27.6
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { namedClasses, stringLiterals } from '../../src/translate/classNameLiterals';
import { callsDefinitionLookup, planEmitDetailed } from '../../src/emit/planEmit';
import type { TranslatedClass } from '../../src/translate/planTranslate';

describe('stringLiterals', () => {
  it('folds adjacent literals joined by + and skips comments and escapes', () => {
    expect(stringLiterals('x = "a" + \'b\' + "c"; // "d"\n/* "e" */ y = "f\\n"; z = "";')).toEqual(['abc']);
  });
  it('stops folding at a non-literal operand', () => {
    expect(stringLiterals('x = "a" + n + "b";')).toEqual(['a', 'b']);
  });
});

describe('namedClasses', () => {
  const exported = new Set(['Main', 'pkg.sub.Game', 'Other']);
  it('matches whole Qualified_Names, in either package form, sorted and de-duplicated', () => {
    expect(namedClasses('a("pkg.sub::Game"); b("Main"); c("pkg.sub.Game"); d("Mai"); e("main")', exported)).toEqual(['Main', 'pkg.sub.Game']);
  });
});

describe('class registry for getDefinitionByName (D-E2)', () => {
  const tc = (className: string, text: string): TranslatedClass =>
    ({ className, fileName: `${className}.ts`, text, diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [] }) as TranslatedClass;
  const scene = { formatVersion: 3, rootSymbolId: 0, symbols: { '0': { type: 'sprite', className: 'Preloader', frameCount: 1, labels: [], frames: [[]] } } } as unknown as SceneJson;
  const classesTs = (translated: TranslatedClass[]): string => {
    const r = planEmitDetailed({ scene, sceneJson: '{}', templates: [], translated, handwritten: [] }, []);
    return r.files.find((f) => f.path === 'src/classes.ts')?.content ?? '';
  };

  it('sees a call on a code line, not in a comment line', () => {
    expect(callsDefinitionLookup('  const c = getDefinitionByName("Main");')).toBe(true);
    expect(callsDefinitionLookup('    // AS3: c = getDefinitionByName("Main");')).toBe(false);
    expect(callsDefinitionLookup('/* old: getDefinitionByName("Main")\n   still comment */ const x = 1;')).toBe(false);
    expect(callsDefinitionLookup('/* note */ const c = getDefinitionByName("Main");')).toBe(true);
  });

  it('registers every emitted class when one class looks a name up, and only the linked ones otherwise', () => {
    const withLookup = classesTs([tc('Preloader', 'export class Preloader { f() { return getDefinitionByName("Main"); } }\n'), tc('Main', 'export class Main {}\n')]);
    expect(withLookup).toContain('registerDefinitions({');
    expect(withLookup).toContain('"Main": Main,');
    const without = classesTs([tc('Preloader', 'export class Preloader {}\n'), tc('Main', 'export class Main {}\n')]);
    expect(without).not.toContain('registerDefinitions');
    expect(without).not.toContain('"Main"');
  });
});
