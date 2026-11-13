import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkClassFile, checkClassFiles } from '../../src/emit/bundlerGuard';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translate, translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { fixtureTables } from '../support/tables';

const wrap = (body: string): string => `export class C {\n  m(): number {\n    ${body}\n  }\n}\n`;

describe('Bundler_Guard: the nine probe cases of Appendix A.12 against the pinned Vite', () => {
  const bad: [string, string, 'transform' | 'parse', RegExp][] = [
    ['yield', wrap('const yield = 1; return yield;'), 'parse', /yield/i],
    ['await', wrap('const await = 1; return await;'), 'parse', /await/i],
    ['package', wrap('const package = 1; return package;'), 'parse', /package/i],
    ['duplicate declaration', wrap('let a = 1; let a = 2; return a;'), 'transform', /already been declared/],
    ['delete x', wrap('let x = 1; delete x; return x;'), 'parse', /delete/i],
    ['with', wrap('with ({}) { return 1; }'), 'parse', /with/i],
    ['break', wrap('break; return 1;'), 'parse', /break/i],
  ];
  for (const [name, text, phase, message] of bad) {
    it(`rejects ${name} in the ${phase} phase`, async () => {
      const { verdict } = await checkClassFile('src/C.ts', text);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      expect(verdict.phase).toBe(phase);
      expect(verdict.message).toMatch(message);
      expect(verdict.message).not.toContain('\u001b');
      expect(verdict.line).toBeGreaterThan(0);
      expect(verdict.column).toBeGreaterThan(0);
    });
  }

  it('accepts an octal literal in a plain file', async () => {
    expect((await checkClassFile('src/C.ts', wrap('return 010;'))).verdict).toEqual({ ok: true });
  });

  it('accepts a clean class', async () => {
    expect((await checkClassFile('src/C.ts', wrap('return 1;'))).verdict).toEqual({ ok: true });
  });
});

describe('Bundler_Guard: Surviving_Imports', () => {
  it('drops an unused import and a type-only import, keeps used ones sorted', async () => {
    const text = [
      `import { B, Unused } from './B';`,
      `import type { T } from './T';`,
      `import { type U, V } from './V';`,
      `import { A } from './A';`,
      `import './side';`,
      `export class C { m(): unknown { return [A, B, V]; } }`,
      '',
    ].join('\n');
    const { verdict, imports } = await checkClassFile('src/C.ts', text);
    expect(verdict).toEqual({ ok: true });
    expect(imports).toEqual([
      { specifier: './A', names: ['A'] },
      { specifier: './B', names: ['B'] },
      { specifier: './V', names: ['V'] },
      { specifier: './side', names: [] },
    ]);
  });

  it('counts a re-export as an import', async () => {
    const text = `export { Z } from './Z';\nexport * from './R';\nexport class C {}\n`;
    const { imports } = await checkClassFile('src/C.ts', text);
    expect(imports).toEqual([
      { specifier: './R', names: ['*'] },
      { specifier: './Z', names: ['Z'] },
    ]);
  });

  it('records default and namespace imports', async () => {
    const text = `import D from './D';\nimport * as N from './N';\nexport const c = [D, N];\n`;
    const { imports } = await checkClassFile('src/C.ts', text);
    expect(imports).toEqual([
      { specifier: './D', names: ['default'] },
      { specifier: './N', names: ['*'] },
    ]);
  });

  it('gives the same check on two runs and on checkClassFiles in sorted order', async () => {
    const files = new Map([
      ['src/b/B.ts', wrap('with ({}) {}')],
      ['src/a/A.ts', `import { X } from './X';\nexport class A { x = X; }\n`],
    ]);
    const one = await checkClassFiles(files);
    const two = await checkClassFiles(files);
    expect(JSON.stringify([...one])).toBe(JSON.stringify([...two]));
    expect([...one.keys()]).toEqual(['src/a/A.ts', 'src/b/B.ts']);
    expect(one.get('src/b/B.ts')!.verdict.ok).toBe(false);
  });
});

describe('Bundler_Guard: the octal literal (Requirement 26.14)', () => {
  const as3 = [
    'package',
    '{',
    '   public class Oct',
    '   {',
    '      public function Oct()',
    '      {',
    '         super();',
    '      }',
    '      ',
    '      public function value() : int',
    '      {',
    '         return 010;',
    '      }',
    '   }',
    '}',
    '',
  ].join('\n');

  const options = {
    shimNames: SHIM_AS3_NAMES,
    tables: fixtureTables('test/fixtures/clickgoto'),
    selfQualified: 'Oct',
    siblingClasses: new Set<string>(),
    syntaxCheck: tsSyntaxCheck,
  };

  it('states which side an AS3 octal literal falls on, with no special case', async () => {
    // Side 1: the guard accepts the emitted literal (Appendix A.12), so no bundler-parse omission and no rule for it.
    const core = translateCore(as3, options);
    expect(core.text).toMatch(/return 010;/);
    expect((await checkClassFile('src/Oct.ts', core.text)).verdict).toEqual({ ok: true });

    // Side 2, observed: translate() runs the TypeScript syntax check first, which rejects `010` (TS1121), so the
    // translator itself falls back (D5) to the file as `// AS3:` comments. The guard then sees comments only: ok.
    const r = translate(as3, options);
    expect(r.diagnostics.map((d) => d.kind)).toEqual(['unsupported-construct']);
    expect(r.diagnostics[0].message).toMatch(/Octal literals are not allowed/);
    expect(r.text.split('\n').filter((l) => l !== '').every((l) => l.startsWith('// AS3:'))).toBe(true);
    expect((await checkClassFile('src/Oct.ts', r.text)).verdict).toEqual({ ok: true });
  });
});

describe('Bundler_Guard: unavailable', () => {
  afterEach(() => {
    vi.doUnmock('vite');
    vi.resetModules();
  });

  it('rejects with BundlerGuardUnavailable when vite cannot be loaded', async () => {
    vi.resetModules();
    vi.doMock('vite', () => {
      throw new Error('stubbed import failure');
    });
    const guard = await import('../../src/emit/bundlerGuard');
    await expect(guard.checkClassFile('src/C.ts', wrap('return 1;'))).rejects.toBeInstanceOf(guard.BundlerGuardUnavailable);
  });
});
