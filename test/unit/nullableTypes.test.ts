// Nullable reference types (Requirements 3.1, 3.2, 3.4, 3.8, 3.9). Fixture_Classes only; no sample is named.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { decideClassOmissions, type OmissionClass } from '../../src/emit/classOmissions';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import type { TranslateOptions } from '../../src/translate/types';

vi.setConfig({ testTimeout: 60_000 });

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'A',
  siblingClasses: new Set(['A', 'Foo', 'IFoo']),
  syntaxCheck: tsSyntaxCheck,
};
const t = (members: string): string =>
  translateCore(`package\n{\n  public class A\n  {\n${members}\n  }\n}\n`, options).text;

describe('translate: reference types admit null (Requirement 3.1, 3.2)', () => {
  it('adds | null in field, parameter, local and return positions', () => {
    const out = t(
      [
        '    public var f:Foo;',
        '    public function m(p:Foo, q:String, r:Array):Foo',
        '    {',
        '      var l:IFoo = null;',
        '      var o:Function;',
        '      return null;',
        '    }',
      ].join('\n'),
    );
    expect(out).toContain('f: Foo | null');
    expect(out).toContain('m(p: Foo | null, q: string | null, r: any[] | null): Foo | null {');
    expect(out).toContain('var l: IFoo | null = null;');
    expect(out).toContain('var o: Function | null;');
  });

  it('never widens int, uint, Number, Boolean or void', () => {
    const out = t(
      '    public var a:int;\n    public var b:uint;\n    public var c:Number;\n    public var d:Boolean;\n    public function m(x:int):void\n    {\n    }',
    );
    expect(out).toContain('a: number = 0;');
    expect(out).toContain('b: number = 0;');
    expect(out).toContain('c: number = NaN;');
    expect(out).toContain('d: boolean = false;');
    expect(out).toContain('m(x: number): void {');
    expect(out).not.toMatch(/(number|boolean|void) \| null/);
  });

  it('leaves Object and * as any, which already admits null', () => {
    const out = t('    public var o:Object;\n    public var s:*;');
    expect(out).not.toMatch(/any \| null/);
  });

  it('keeps an accessor pair on one type text', () => {
    const out = t(
      '    public function get v():Foo\n    {\n      return null;\n    }\n    public function set v(n:Foo):void\n    {\n    }',
    );
    expect(out).toContain('get v(): Foo | null {');
    expect(out).toContain('set v(n: Foo | null) {');
  });
});

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
function readTree(dir: string, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTree(full, `${prefix}${name}/`));
    else if (name !== '.gitkeep') out.push([`${prefix}${name}`, readFileSync(full, 'utf8').replace(/\r\n/g, '\n')]);
  }
  return out;
}

const GATE_CLASS = `export class Foo {
  public next: Foo | null = null;
  public n: number = 0;
  public go(): number { return 1; }
}
export class User {
  public foo: Foo | null = null;
  public run(): number {
    this.foo = null;
    return this.foo.go() + this.foo.next.n;
  }
}
`;

describe('type-check gate without strictNullChecks (Requirement 3.3, 3.8)', () => {
  it('reports no error for a null assignment and a dereference of a nullable field', () => {
    const files = new Map(readTree(join(repoRoot, 'template')));
    files.set('src/Foo.ts', GATE_CLASS);
    expect(typeCheckProject({ files, repoRoot }).errors).toEqual([]);
  });

  it('keeps the gate off even when the project tsconfig turns strictNullChecks on', () => {
    const files = new Map(readTree(join(repoRoot, 'template')));
    files.set('tsconfig.json', files.get('tsconfig.json')!.replace('"strictNullChecks": false', '"strictNullChecks": true'));
    files.set('src/Foo.ts', GATE_CLASS);
    expect(typeCheckProject({ files, repoRoot }).errors).toEqual([]);
  });

  it('still reports other type errors (every other strict flag stays on)', () => {
    const files = new Map(readTree(join(repoRoot, 'template')));
    files.set('src/Foo.ts', "export class Foo {\n  public n: number = 'x';\n}\n");
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.map((e) => e.code)).toEqual([2322]);
  });
});

describe('registry (Requirement 3.4)', () => {
  it('keeps a class whose only former error was a null assignment', () => {
    const classes: OmissionClass[] = [
      { className: 'A', path: 'src/A.ts', extendsQualified: null, importsQualified: [], handwritten: false, produced: true },
    ];
    // The gate now returns no error for such a class, so nothing is omitted.
    expect(decideClassOmissions([], classes, [])).toEqual([]);
  });
});
