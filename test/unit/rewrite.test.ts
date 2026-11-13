import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emitTs } from '../../src/translate/emitTs';
import { canonicalClassPath } from '../../src/convert/qualifiedName';
import { planFileImports } from '../../src/translate/importPlan';
import { collectReferences, createImportLines, createRewriter } from '../../src/translate/rewrite';
import { scan } from '../../src/translate/scanner';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { normalizeNewlines, tokenize } from '../../src/translate/tokenizer';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { fixtureTables } from '../support/tables';

const SIBLINGS = new Set(['EventWatcher', 'LeftButton', 'RightButton', 'MainTimeline']);
function run(source: string, known: ReadonlySet<string> = SIBLINGS, self = 'A', onMethodValue?: (className: string, name: string) => void) {
  const src = normalizeNewlines(source);
  const tokens = tokenize(src);
  const { nodes } = scan(tokens);
  const refs = collectReferences(tokens, nodes, known);
  const plan = planFileImports({
    selfQualified: self,
    declared: refs.declared,
    shimNames: SHIM_AS3_NAMES,
    known,
    imports: refs.imports,
    bare: refs.bare,
    chains: refs.chains,
  });
  const shimUsed = [...refs.bare.keys()].filter(
    (n) => !refs.declared.has(n) && SHIM_AS3_NAMES.has(n) && !plan.bindingOfBare.has(n),
  );
  const imports = createImportLines(plan, canonicalClassPath(self), shimUsed);
  const tables = fixtureTables('test/fixtures/clickgoto', [[self, src]]);
  const options = { shimNames: SHIM_AS3_NAMES, plan, tables, self, onMethodValue };
  const out = emitTs(nodes, {
    source: src,
    tokens,
    rewriter: createRewriter(nodes, options),
    hooks: { importLines: () => imports.lines },
  });
  return { out, nodes, tokens, plan, imports };
}const cls = (members: string, head = 'public class A'): string =>
  `package\n{\n  ${head}\n  {\n${members}\n  }\n}\n`;
const fn = (body: string, sig = 'public function f() : *'): string =>
  cls(`    ${sig}\n    {\n${body}\n    }`);

function fixture(name: string): string {
  return readFileSync(`test/fixtures/clickgoto/scripts/${name}.as`, 'utf8');
}

describe('rewrite: expressions', () => {
  it('rewrites int()/uint() with the precedence wrapping rule', () => {
    const { out } = run(fn('      var a:int = int(x);\n      var b:uint = uint(c ? 1 : 2);\n      var d:int = int(p || q);'));
    expect(out.text).toContain('var a: number = (x | 0);');
    expect(out.text).toContain('var b: number = ((c ? 1 : 2) >>> 0);');
    expect(out.text).toContain('var d: number = ((p || q) | 0);');
    expect(tsSyntaxCheck(out.text)).toEqual([]);
  });

  it('makes int used as a value unsupported', () => {
    const { out } = run(fn('      var a:* = int.MAX_VALUE;\n      b();'));
    expect(out.diagnostics.filter((d) => d.kind === 'unsupported-construct')).toHaveLength(1);
    expect(out.text).toContain('// AS3:');
  });

  it('maps is/as and refuses primitive right-hand types', () => {
    const { out } = run(fn('      var a:* = x is Sprite;\n      var b:* = x as Sprite;\n      var c:* = x is int;'));
    expect(out.text).toContain('x instanceof Sprite');
    expect(out.text).toContain('x as Sprite');
    expect(out.diagnostics.filter((d) => d.kind === 'unsupported-construct')).toHaveLength(1);
  });

  it('maps Vector.<T> including nested >> and new Vector', () => {
    const { out } = run(fn('      var a:Vector.<Vector.<int>> = new Vector.<Vector.<int>>();\n      var b:Vector.<String>;'));
    expect(out.text).toContain('var a: number[][] = new Array<number[]>();');
    expect(out.text).toContain('var b: string[];');
    expect(tsSyntaxCheck(out.text)).toEqual([]);
  });

  it('qualifies bare member calls but not locals or member accesses', () => {
    const { out } = run(
      cls('    public function g(stop:Function) : void\n    {\n      stop();\n      play();\n      h();\n      this.play();\n    }\n    public function h() : void\n    {\n    }', 'public class A extends MovieClip'),
    );
    expect(out.text).toContain('    stop();');
    expect(out.text).toContain('this.play();\n    this.h();\n    this.play();');
  });

  it('casts .parent.member to any with one loose-type per access', () => {
    const { out } = run(fn('      this.parent.r.gotoAndStop(1);\n      a.parent.b.c();'));
    expect(out.text).toContain('(this.parent as any).r.gotoAndStop(1);');
    expect(out.text).toContain('(a.parent as any).b.c();');
    expect(out.diagnostics.filter((d) => d.kind === 'loose-type')).toHaveLength(2);
  });

  it('turns for each into for-of', () => {
    const { out } = run(fn('      for each (var x:int in list)\n      {\n        trace(x);\n      }'));
    expect(out.text).toContain('for (const x of list) {');
  });
});

describe('rewrite: declarations', () => {
  it('uses AS3 defaults for numeric/boolean fields and declare for the rest', () => {
    const { out } = run(
      cls('    public var n:int;\n    public var u:Number;\n    var b:Boolean;\n    public var c:Foo;\n    public static var s:Foo;\n    const k:int = 3;'),
    );
    expect(out.text).toContain('public n: number = 0;');
    expect(out.text).toContain('public u: number = NaN;');
    expect(out.text).toContain('b: boolean = false;');
    expect(out.text).toContain('public declare c: Foo;');
    expect(out.text).toContain('public static s: Foo;');
    expect(out.text).toContain('readonly k: number = 3;');
  });

  it('reports loose types and maps * returns', () => {
    const { out } = run(
      cls('    internal var x:* = 0;\n    public function a() : *\n    {\n      return 1;\n    }\n    public function b(p, ...rest) : *\n    {\n    }'),
    );
    expect(out.text).toContain('x: any = 0;');
    expect(out.text).toContain('a(): any {');
    expect(out.text).toContain('b(p: any, ...rest: any[]): void {');
    // x, a() return, p, rest
    expect(out.diagnostics.filter((d) => d.kind === 'loose-type')).toHaveLength(4);
  });

  it('flags a setter whose type differs from its getter', () => {
    const { out } = run(
      cls('    public function get v() : int\n    {\n      return 1;\n    }\n    public function set v(n:String) : void\n    {\n    }'),
    );
    expect(out.text).toContain('get v(): number {');
    expect(out.text).toContain('set v(n: number) {');
    expect(out.diagnostics.filter((d) => d.kind === 'loose-type')).toHaveLength(1);
  });

  it('reports the methods used as values through onMethodValue, in source order', () => {
    const seen: string[] = [];
    run(fixture('LeftButton'), SIBLINGS, 'LeftButton', (c, n) => seen.push(c + '.' + n));
    expect(seen).toEqual(['LeftButton.frame1', 'LeftButton.frame2', 'LeftButton.clicked']);
  });
});

describe('rewrite: clickgoto fixtures', () => {
  for (const name of ['EventWatcher', 'LeftButton', 'RightButton', 'MainTimeline']) {
    it(`${name} translates without unsupported constructs and parses`, () => {
      const { out } = run(fixture(name));
      expect(out.diagnostics.filter((d) => d.kind === 'unsupported-construct')).toEqual([]);
      expect(tsSyntaxCheck(out.text)).toEqual([]);
    });
  }

  it('LeftButton output', () => {
    const { out } = run(fixture('LeftButton'));
    expect(out.text.startsWith("import { Event, MouseEvent, trace } from '../shim';\nimport { EventWatcher } from './EventWatcher';\n")).toBe(true);
    expect(out.text).toContain('this.addFrameScript(0,this.frame1,1,this.frame2);');
    expect(out.text).toContain('clicked(event: Event): void {');
    expect(out.text).toContain('(this.parent as any).r_button.gotoAndStop(1);');
    expect(out.diagnostics.map((d) => d.kind)).toEqual(['loose-type']);
  });

  it('MainTimeline output', () => {
    const { out } = run(fixture('MainTimeline'));
    expect(out.text).toContain(
      "import { DisplayObject, DisplayObjectContainer, Event, Shape, trace } from '../shim';\nimport { EventWatcher } from './EventWatcher';\nimport { LeftButton } from './LeftButton';\nimport { RightButton } from './RightButton';\n",
    );
    expect(out.text).toContain('public declare l_button: LeftButton;');
    expect(out.text).toContain('invocation: any = 0;');
    expect(out.text).toContain('from instanceof DisplayObjectContainer');
    expect(out.text).toContain('inspect(from: DisplayObject): void {');
  });
});
