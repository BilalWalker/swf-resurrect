import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { SHIM_AS3_NAMES, SHIM_MOVIECLIP_MEMBERS } from '../../src/translate/shimNames';
import { translate, translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import type { TranslateOptions } from '../../src/translate/types';

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  shimMembers: SHIM_MOVIECLIP_MEMBERS,
  siblingClasses: new Set(['EventWatcher', 'LeftButton', 'RightButton', 'MainTimeline']),
  syntaxCheck: tsSyntaxCheck,
};

const fixture = (name: string): string => readFileSync(`test/fixtures/clickgoto/scripts/${name}.as`, 'utf8');
const t = (src: string): string => translateCore(src, options).text;
const cls = (head: string, members: string): string => `package\n{\n  ${head}\n  {\n${members}\n  }\n}\n`;

describe('translateCore: constructors (design 1.6)', () => {
  it('moves super() first, then binds, then the rest in order (LeftButton)', () => {
    const out = t(fixture('LeftButton'));
    const lines = out.split('\n').map((l) => l.trim());
    const at = (s: string): number => lines.indexOf(s);
    const sup = at('super();');
    const bind1 = at('this.clicked = this.clicked.bind(this);');
    const f1 = at('this.frame1 = this.frame1.bind(this);');
    const f2 = at('this.frame2 = this.frame2.bind(this);');
    const afs = at('this.addFrameScript(0,this.frame1,1,this.frame2);');
    const lis = at('this.addEventListener(MouseEvent.CLICK,this.clicked);');
    const stop = at('this.stop();');
    expect(sup).toBeGreaterThan(0);
    expect([sup, bind1, f1, f2, afs, lis, stop].every((n, i, a) => n > 0 && (i === 0 || n > a[i - 1]))).toBe(true);
    // Binds follow declaration order: clicked, frame1, frame2.
    expect(bind1).toBeLessThan(f1);
    expect(f1).toBeLessThan(f2);
  });

  it('inserts super() when an extends class lacks it', () => {
    const out = t(cls('public class A extends B', '    public function A()\n    {\n      this.x = 1;\n    }'));
    expect(out).toMatch(/constructor\(\) \{\n {4}super\(\);\n {4}this\.x = 1;/);
  });

  it('synthesises a constructor for binds, with super() when extends', () => {
    const members =
      '    public function a() : *\n    {\n      this.addEventListener("x", this.b);\n    }\n' +
      '    public function b() : *\n    {\n    }';
    const withBase = t(cls('public class A extends B', members));
    expect(withBase).toContain('constructor() {\n    super();\n    this.b = this.b.bind(this);\n  }');
    const plain = t(cls('public class A', members));
    expect(plain).toContain('constructor() {\n    this.b = this.b.bind(this);\n  }');
    expect(plain).not.toContain('super');
  });

  it('leaves a constructor alone when nothing needs changing', () => {
    const out = t(cls('public class A extends B', '    public function A()\n    {\n      super();\n      this.y = 2;\n    }'));
    expect(out).toContain('constructor() {\n    super();\n    this.y = 2;\n  }');
    expect(out).not.toContain('bind');
  });

  it('does not bind static methods or methods only called', () => {
    const members =
      '    public static function s() : *\n    {\n    }\n' +
      '    public function m() : *\n    {\n      this.m();\n    }';
    expect(t(cls('public class A', members))).not.toContain('bind');
  });

  it('translates all four fixture classes without unsupported constructs', () => {
    for (const n of ['EventWatcher', 'LeftButton', 'RightButton', 'MainTimeline']) {
      const r = translateCore(fixture(n), options);
      expect(r.diagnostics.filter((d) => d.kind === 'unsupported-construct')).toEqual([]);
      expect(tsSyntaxCheck(r.text)).toEqual([]);
      expect(r.classes).toHaveLength(1);
    }
  });
});

describe('translateCore: R3 (declare and bind accepted by tooling)', () => {
  const dir = '.work/t81';
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('MainTimeline output uses declare and passes the syntax check', () => {
    const out = t(fixture('MainTimeline'));
    expect(out).toContain('public declare l_button: LeftButton;');
    expect(tsSyntaxCheck(out)).toEqual([]);
  });

  it('translated classes load through the Vite/Vitest transform; bind leaves zero listeners', async () => {
    mkdirSync(dir, { recursive: true });
    for (const n of ['EventWatcher', 'LeftButton', 'MainTimeline']) {
      writeFileSync(`${dir}/${n}.ts`, t(fixture(n)));
    }
    const load = async (n: string): Promise<Record<string, new () => any>> =>
      (await import(/* @vite-ignore */ pathToFileURL(`${process.cwd()}/${dir}/${n}.ts`).href)) as never;
    const { LeftButton } = await load('LeftButton');
    const { MainTimeline } = await load('MainTimeline');

    const b = new LeftButton();
    // EventWatcher.setup() registered trace_event for 8 types; destroy() must remove them all.
    const types = ['enterFrame', 'exitFrame', 'added', 'addedToStage', 'frameConstructed', 'removed', 'removedFromStage', 'render'];
    expect(types.some((ty) => b.hasEventListener(ty))).toBe(true);
    b.destroy();
    expect(types.some((ty) => b.hasEventListener(ty))).toBe(false);

    const m = new MainTimeline();
    // `declare` emits nothing: the named child is not an own property after construction.
    expect(Object.prototype.hasOwnProperty.call(m, 'l_button')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(m, 'enter_frame_controller')).toBe(true);
  });
});

describe('translate: syntax check and D5 fallback', () => {
  const failing = { ...options, syntaxCheck: () => [{ line: 3, message: 'boom' }, { line: 4, message: 'second' }] };
  const src = cls('public class A', '    public var x:int;');

  it('replaces a failing result with comments, one line-1 Diagnostic and one unsupported span', () => {
    const r = translate(src, failing);
    const lines = r.text.split('\n');
    expect(lines.pop()).toBe('');
    expect(lines.length).toBe(src.split('\n').length - 1);
    expect(lines.every((l) => l.startsWith('// AS3:'))).toBe(true);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0].kind).toBe('unsupported-construct');
    expect(r.diagnostics[0].line).toBe(1);
    expect(r.diagnostics[0].message).toContain('boom');
    expect(r.diagnostics[0].message).not.toContain('second');
    expect(r.spans).toEqual([{ startLine: 1, endLine: lines.length, kind: 'unsupported' }]);
    expect(tsSyntaxCheck(r.text)).toEqual([]);
  });

  it('keeps the translated result when the check passes', () => {
    expect(translate(src, options)).toEqual(translateCore(src, options));
  });

  it('returns empty text for blank input and does not call the check', () => {
    let calls = 0;
    const spy = { ...options, syntaxCheck: () => { calls++; return [{ line: 1, message: 'x' }]; } };
    for (const blank of ['', '  \n\t\r\n']) {
      const r = translate(blank, spy);
      expect(r.text).toBe('');
      expect(r.diagnostics).toEqual([]);
    }
    expect(calls).toBe(0);
  });
});
