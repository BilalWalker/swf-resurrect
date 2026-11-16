// Import-cycle cut in the translator (as3-coverage task 5.2, Requirement 37). Fixture_Classes only.
// Validates: Requirements 37.3, 37.5, 37.9
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { planTranslate } from '../../src/translate/planTranslate';
import { buildReport } from '../../src/translate/report';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { buildClassesTs } from '../../src/emit/planEmit';

function sceneWith(classNames: string[]): SceneJson {
  const symbols: Record<string, unknown> = {};
  classNames.forEach((c, i) => {
    symbols[String(i)] = { type: 'sprite', frames: [], labels: {}, className: c };
  });
  return { formatVersion: 1, rootSymbolId: 0, symbols } as unknown as SceneJson;
}

const cls = (name: string, body: string, base?: string): string =>
  `package {\n  public class ${name}${base ? ` extends ${base}` : ''} {\n${body}\n  }\n}\n`;

/** Base -> Scene -> Fly -> Base: the field initialiser of Base closes the cycle. */
const CYCLE = [
  { className: 'Base', source: cls('Base', '    private var levelScene:* = Scene;\n    public function Base() {\n    }') },
  { className: 'Fly', source: cls('Fly', '    public function Fly() {\n    }', 'Base') },
  { className: 'Scene', source: cls('Scene', '    public function make():Fly {\n      return new Fly();\n    }') },
];

describe('import-cycle cut', () => {
  it('reads the cut class through getDefinitionByName and drops its import', () => {
    const r = planTranslate(CYCLE, sceneWith(['Fly']), tsSyntaxCheck);
    const base = r.classes.find((c) => c.className === 'Base');
    expect(base?.text).toContain("getDefinitionByName('Scene')");
    expect(base?.text).not.toMatch(/import \{[^}]*\bScene\b[^}]*\} from/);
    expect(base?.text).toMatch(/import \{[^}]*getDefinitionByName[^}]*\} from/);
    expect(base?.importRecords.some((x) => x.target === 'Scene')).toBe(false);
    expect(base?.cutSites).toEqual([{ target: 'Scene', line: expect.any(Number) }]);
    expect(r.importCycles ?? []).toEqual([]);
  });

  it('leaves classes outside a cycle unchanged', () => {
    const r = planTranslate(
      [
        { className: 'Base', source: cls('Base', '    private var s:* = Scene;\n    public function Base() {\n    }') },
        { className: 'Fly', source: cls('Fly', '    public function Fly() {\n    }', 'Base') },
        { className: 'Scene', source: cls('Scene', '    public function Scene() {\n    }') },
      ],
      sceneWith(['Fly']),
      tsSyntaxCheck,
    );
    const base = r.classes.find((c) => c.className === 'Base');
    expect(base?.text).not.toContain('getDefinitionByName');
    expect(base?.importRecords.some((x) => x.target === 'Scene')).toBe(true);
  });

  it('keeps the cut class as an import type when a type annotation still names it', () => {
    const r = planTranslate(
      [
        { className: 'Base', source: cls('Base', '    private var s:Scene = Scene;\n    public function Base() {\n    }') },
        CYCLE[1],
        CYCLE[2],
      ],
      sceneWith(['Fly']),
      tsSyntaxCheck,
    );
    const base = r.classes.find((c) => c.className === 'Base');
    expect(base?.text).toMatch(/import type \{ Scene \} from/);
    expect(base?.text).toContain("getDefinitionByName('Scene')");
  });

  it('records import-cycle with the path when the only import is used in a static initialiser', () => {
    const r = planTranslate(
      [
        { className: 'Base', source: cls('Base', '    public static var s:* = Scene;\n    public function Base() {\n    }') },
        CYCLE[1],
        { className: 'Scene', source: cls('Scene', '    public static var f:* = Fly;\n    public function Scene() {\n    }') },
      ],
      sceneWith(['Fly']),
      tsSyntaxCheck,
    );
    expect(r.importCycles).toEqual([{ className: 'Fly', path: ['Base', 'Scene', 'Fly'] }]);
    expect(r.classes.map((c) => c.className)).toEqual(['Base', 'Fly', 'Scene']);
    expect(r.classes.find((c) => c.className === 'Base')?.text).not.toContain('getDefinitionByName');
  });

  it('registers every emitted class in classes.ts only when a cut exists', () => {
    const scene = sceneWith(['Fly']);
    const without = buildClassesTs(scene, ['Base', 'Fly', 'Scene']);
    expect(without).not.toContain('registerDefinitions');
    const withAll = buildClassesTs(scene, ['Base', 'Fly', 'Scene'], new Set(), new Map(), true);
    expect(withAll).toContain('registerDefinitions({');
    expect(withAll).toContain('"Scene": Scene,');
    expect(withAll).toContain('"Fly": Fly,');
    expect(withAll).toContain('export const classRegistry = {\n  "Fly": Fly,\n};');
  });

  it('the Translation_Report lists the cut sites and an import-cycle problem', () => {
    const report = buildReport([], null, {
      importCuts: [{ className: 'Base', target: 'Scene', line: 5 }],
      problems: [{ kind: 'import-cycle', message: 'Fly extends Base', path: 'Fly' }],
    });
    expect(report.importCuts).toEqual([{ className: 'Base', target: 'Scene', line: 5 }]);
    expect(report.problems?.[0].kind).toBe('import-cycle');
  });
});
