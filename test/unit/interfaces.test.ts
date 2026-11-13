import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/pipeline/cli';
import { serialiseScene } from '../../src/convert/sceneJson';
import { planEmitDetailed } from '../../src/emit/planEmit';
import type { TemplateFile } from '../../src/emit/planEmit';
import { exportedNames } from '../../src/emit/exportedNames';
import { planTranslate } from '../../src/translate/planTranslate';
import { untranslatedCodeEntries } from '../../src/translate/report';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translate } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import * as shimInterfaces from '../../template/shim/interfaces';
import { evalTranslated } from '../support/evalTranslated';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import type { SceneJson } from '../../template/runtime/scene';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
vi.setConfig({ testTimeout: 120_000 });

function readTemplates(dir = join(repoRoot, 'template'), prefix = ''): TemplateFile[] {
  const out: TemplateFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTemplates(full, `${prefix}${name}/`));
    else out.push({ path: `${prefix}${name}`, content: readFileSync(full, 'utf8') });
  }
  return out;
}

// Hand-written equivalents of the forms in the three slider_component interfaces (no decompiled text).
const IFOCUS = `package fl.managers
{
   import fl.controls.Button;
   import flash.display.InteractiveObject;
   public interface IFocusManager
   {
      function get defaultButton() : Button;
      function set defaultButton(param1:Button) : void;
      function get nextTabIndex() : int;
      function getFocus() : InteractiveObject;
      function setFocus(param1:InteractiveObject) : void;
      function getNextFocusManagerComponent(param1:Boolean = false) : InteractiveObject;
   }
}
`;
const ICOMPONENT = `package fl.managers
{
   public interface IFocusManagerComponent
   {
      function get focusEnabled() : Boolean;
      function set focusEnabled(param1:Boolean) : void;
      function get tabIndex() : int;
      function setFocus() : void;
      function drawFocus(param1:Boolean) : void;
   }
}
`;
const IGROUP = `package fl.managers
{
   public interface IFocusManagerGroup
   {
      function get groupName() : String;
      function set groupName(param1:String) : void;
      function get selected() : Boolean;
      function set selected(param1:Boolean) : void;
   }
}
`;
const BUTTON = `package fl.controls
{
   import fl.managers.IFocusManagerComponent;
   public class Button implements IFocusManagerComponent
   {
      public var focusEnabled:Boolean = true;
      public function Button()
      {
         super();
      }
      public function get tabIndex() : int
      {
         return 0;
      }
      public function setFocus() : void
      {
      }
      public function drawFocus(param1:Boolean) : void
      {
      }
      public function test(param1:Object) : Boolean
      {
         return param1 is IFocusManagerComponent;
      }
   }
}
`;

const sc: SceneJson = {
  formatVersion: 1,
  stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: { '0': { type: 'sprite', className: 'fl.controls.Button', frameCount: 1, labels: [], frames: [[]] } },
};

const plan = (sources: Array<[string, string]>, scene: SceneJson = sc) =>
  planTranslate(sources.map(([className, source]) => ({ className, source })), scene, tsSyntaxCheck);

const sliderScene: SceneJson = {
  ...sc,
  symbols: Object.fromEntries(
    ['fl.controls.Button', 'fl.managers.IFocusManager', 'fl.managers.IFocusManagerGroup'].map((className, i) => [String(i), { type: 'sprite' as const, className, frameCount: 1, labels: [], frames: [[]] }]),
  ),
};

const sliderSources: Array<[string, string]> = [
  ['fl.controls.Button', BUTTON],
  ['fl.managers.IFocusManager', IFOCUS],
  ['fl.managers.IFocusManagerComponent', ICOMPONENT],
  ['fl.managers.IFocusManagerGroup', IGROUP],
];

describe('AS3 interface declarations (Requirement 27.1, 27.6)', () => {
  it('emits an exported TypeScript interface and a token with the Qualified_Name', () => {
    const r = plan(sliderSources, {
      ...sc,
      symbols: { '0': { type: 'sprite', className: 'fl.managers.IFocusManagerComponent', frameCount: 1, labels: [], frames: [[]] } },
    });
    const c = r.classes.find((x) => x.className === 'fl.managers.IFocusManagerComponent');
    expect(c?.text).toBe(
      [
        "import { AS3InterfaceToken, defineInterface } from '../../../shim';",
        '',
        'export interface IFocusManagerComponent {',
        '  focusEnabled: boolean;',
        '  readonly tabIndex: number;',
        '  setFocus(): void;',
        '  drawFocus(param1: boolean): void;',
        '}',
        'export const IFocusManagerComponent: AS3InterfaceToken<IFocusManagerComponent> =',
        "  defineInterface<IFocusManagerComponent>('fl.managers.IFocusManagerComponent', []);",
        '',
      ].join('\n'),
    );
    expect(c?.as3Interface).toBe(false);
    expect(c?.diagnostics).toEqual([]);
    expect(exportedNames(c?.text ?? '')).toEqual(new Set(['IFocusManagerComponent']));
    expect(untranslatedCodeEntries(r.classes, new Set())).toEqual([]);
  });

  it('makes an accessor pair one property, a getter alone readonly, and a default value optional', () => {
    const r = plan(sliderSources, sliderScene);
    const text = r.classes.find((x) => x.className === 'fl.managers.IFocusManager')?.text ?? '';
    expect(text).toContain('  defaultButton: Button;\n');
    expect(text).toContain('  readonly nextTabIndex: number;\n');
    expect(text).toContain('  getNextFocusManagerComponent(param1?: boolean): InteractiveObject;\n');
    expect(text).toContain("import { Button } from '../controls/Button';");
    const group = r.classes.find((x) => x.className === 'fl.managers.IFocusManagerGroup')?.text ?? '';
    expect(group).toContain('  groupName: string;\n  selected: boolean;\n');
  });

  it('turns an interface that extends others into extends and token parents', () => {
    const r = plan(
      [
        ['p.Main', 'package p { public class Main implements IChild { } }'],
        ['p.IChild', 'package p { public interface IChild extends IA, IB { function c():void; } }'],
        ['p.IA', 'package p { public interface IA { function a():void; } }'],
        ['p.IB', 'package p { public interface IB { function b():int; } }'],
      ],
      { ...sc, symbols: { '0': { type: 'sprite', className: 'p.Main', frameCount: 1, labels: [], frames: [[]] } } },
    );
    const child = r.classes.find((x) => x.className === 'p.IChild');
    expect(child?.text).toContain('export interface IChild extends IA, IB {');
    expect(child?.text).toContain("defineInterface<IChild>('p.IChild', [IA, IB]);");
    expect(child?.text).toContain("import { IA } from './IA';");
    expect(child?.as3Interface).toBe(false);
  });

  it('keeps a parent without a source file in extends but not in the token', () => {
    const r = plan(
      [
        ['p.Main', 'package p { public class Main implements IChild { } }'],
        ['p.IChild', 'package p { import flash.events.IEventDispatcher; public interface IChild extends IEventDispatcher { function c():void; } }'],
      ],
      { ...sc, symbols: { '0': { type: 'sprite', className: 'p.Main', frameCount: 1, labels: [], frames: [[]] } } },
    );
    const text = r.classes.find((x) => x.className === 'p.IChild')?.text ?? '';
    expect(text).toContain('export interface IChild extends IEventDispatcher {');
    expect(text).toContain("defineInterface<IChild>('p.IChild', []);");
  });

  it('keeps comments and trailing comments of members', () => {
    const r = plan(
      [
        ['p.Main', 'package p { public class Main implements I { } }'],
        ['p.I', 'package p {\n  public interface I {\n    // first\n    function a():void; // after a\n    function get n():int; /* g */\n    function set n(v:int):void;\n  }\n}\n'],
      ],
      { ...sc, symbols: { '0': { type: 'sprite', className: 'p.Main', frameCount: 1, labels: [], frames: [[]] } } },
    );
    const text = r.classes.find((x) => x.className === 'p.I')?.text ?? '';
    expect(text).toContain('  // first\n  a(): void; // after a\n  n: number; /* g */\n');
  });
});

describe('an interface that cannot be translated keeps the limit (Requirement 27.6)', () => {
  const bad: Array<[string, string]> = [
    ['p.Main', 'package p { public class Main implements IBad { } }'],
    ['p.IBad', 'package p {\n  public interface IBad {\n    function a():void;\n    const X:int = 1;\n  }\n}\n'],
  ];
  const scene = { ...sc, symbols: { '0': { type: 'sprite' as const, className: 'p.Main', frameCount: 1, labels: [], frames: [[]] } } };

  it('writes comments, flags the class and records the as3-interface limit with the new message', () => {
    const r = plan(bad, scene);
    const c = r.classes.find((x) => x.className === 'p.IBad');
    expect(c?.as3Interface).toBe(true);
    expect(c?.text).not.toContain('export');
    expect(c?.text).toContain('// AS3:');
    const entries = untranslatedCodeEntries(r.classes, new Set());
    const limit = entries.find((e) => e.kind === 'as3-interface');
    expect(limit?.tag).toBe('p.IBad');
    expect(limit?.message).toContain('use it as a value');
  });

  it('records no limit for the translated interfaces next to it', () => {
    const r = plan([...bad, ['p.IOk', 'package p { public interface IOk { function a():void; } }']], {
      ...scene,
      symbols: {
        '0': { type: 'sprite' as const, className: 'p.Main', frameCount: 1, labels: [], frames: [[]] },
        '1': { type: 'sprite' as const, className: 'p.IOk', frameCount: 1, labels: [], frames: [[]] },
      },
    });
    const tags = untranslatedCodeEntries(r.classes, new Set()).filter((e) => e.kind === 'as3-interface').map((e) => e.tag);
    expect(tags).toEqual(['p.IBad']);
  });
});

describe('translated interfaces through emit and the real gate (Requirement 27.1, 27.10)', () => {
  it('the three slider forms give no error other than an unresolved Shim type', () => {
    const artifact = plan(sliderSources, sliderScene);
    const emitted = planEmitDetailed(
      { scene: sliderScene, sceneJson: serialiseScene(sliderScene), templates: readTemplates(), translated: artifact.classes, handwritten: [] },
      [],
    );
    const { errors } = typeCheckProject({ files: new Map(emitted.files.map((f) => [f.path, f.content])), repoRoot });
    const own = errors.filter((e) => e.file.startsWith('src/fl/'));
    // InteractiveObject is not in the Shim: TS2304 in the interface file is the only accepted error.
    expect(own.filter((e) => !(e.code === 2304 && e.message.includes('InteractiveObject')))).toEqual([]);
    const names = new Map(emitted.files.map((f) => [f.path, f.content]));
    expect(exportedNames(names.get('src/fl/managers/IFocusManager.ts') ?? '')).toEqual(new Set(['IFocusManager']));
  });

  it('x is I stays instanceof against the token', () => {
    const artifact = plan(sliderSources, sliderScene);
    const button = artifact.classes.find((x) => x.className === 'fl.controls.Button');
    expect(button?.text).toContain('param1 instanceof IFocusManagerComponent');
  });
});

// ---- 24.3: implements registration (Requirement 27.2, 27.3, 27.9 to 27.13) ----

type Src = Record<string, string>;

/** Translates every file with translate() and evaluates the results as modules, with the real Shim token module. */
function runPackage(files: Src): Record<string, Record<string, any>> {
  const known = new Set(Object.keys(files).map((n) => `p.${n}`));
  const texts = new Map<string, string>();
  for (const [name, source] of Object.entries(files)) {
    const r = translate(source, { shimNames: SHIM_AS3_NAMES, selfQualified: `p.${name}`, siblingClasses: known as never, syntaxCheck: tsSyntaxCheck });
    expect(r.diagnostics, name).toEqual([]);
    texts.set(name, r.text);
  }
  const loaded: Record<string, Record<string, any>> = {};
  const load = (name: string): Record<string, any> =>
    (loaded[name] ??= evalTranslated(texts.get(name) as string, new Proxy({}, {
      has: () => true,
      get: (_t, spec: string) => (spec.endsWith('shim') ? shimInterfaces : load(spec.replace('./', ''))),
    })));
  for (const name of Object.keys(files)) load(name);
  return loaded;
}

const iface = (name: string, extend = '') => `package p { public interface ${name}${extend} { function m${name}():void; } }`;
const cls = (name: string, ext: string, impl: string) =>
  `package p { public class ${name}${ext === '' ? '' : ' extends ' + ext}${impl === '' ? '' : ' implements ' + impl} { public function m${name}():void {} } }`;

describe('implements registration through translate() (Requirement 27.2, 27.3, 27.11 to 27.13)', () => {
  it('writes declareImplements after the class and imports it from the Shim', () => {
    const r = translate('package p { public class C implements I { } }', { shimNames: SHIM_AS3_NAMES, selfQualified: 'p.C', siblingClasses: new Set(['p.I', 'p.C']) as never, syntaxCheck: tsSyntaxCheck });
    expect(r.text).toContain("import { declareImplements } from '../../shim';");
    expect(r.text).toContain('}\ndeclareImplements(C, I);\n');
  });

  it('a subclass of an implementer passes is I without declaring anything', () => {
    const m = runPackage({ I: iface('I'), A: cls('A', '', 'I'), B: cls('B', 'A', '') });
    expect(new m.B.B() instanceof m.I.I).toBe(true);
    expect(new m.A.A() instanceof m.I.I).toBe(true);
    expect(({}) instanceof m.I.I).toBe(false);
  });

  it('an implementer of a child interface passes for the child and the parent', () => {
    const m = runPackage({ Parent: iface('Parent'), Child: iface('Child', ' extends Parent'), A: cls('A', '', 'Child') });
    const a = new m.A.A();
    expect(a instanceof m.Child.Child).toBe(true);
    expect(a instanceof m.Parent.Parent).toBe(true);
  });

  it('a class implementing several interfaces passes for each and not for others', () => {
    const m = runPackage({ I1: iface('I1'), I2: iface('I2'), I3: iface('I3'), I4: iface('I4'), A: cls('A', '', 'I1, I2, I3') });
    const a = new m.A.A();
    for (const n of ['I1', 'I2', 'I3']) expect(a instanceof m[n][n], n).toBe(true);
    expect(a instanceof m.I4.I4).toBe(false);
  });

  it('a base and a subclass with different interfaces pass for the union', () => {
    const m = runPackage({ I1: iface('I1'), I2: iface('I2'), A: cls('A', '', 'I1'), B: cls('B', 'A', 'I2') });
    const b = new m.B.B();
    expect(b instanceof m.I1.I1 && b instanceof m.I2.I2).toBe(true);
    expect(new m.A.A() instanceof m.I2.I2).toBe(false);
  });

  it('the UIComponent shape, this is I in a constructor, evaluates against the registration', () => {
    const m = runPackage({
      I: iface('I'),
      Base: `package p { public class Base { public var flag:Boolean; public function Base() { flag = this is I; } } }`,
      Impl: cls('Impl', 'Base', 'I'),
      Plain: cls('Plain', 'Base', ''),
    });
    // declareImplements runs after the class, so a constructor run later sees the registration.
    expect(new m.Impl.Impl().flag).toBe(true);
    expect(new m.Plain.Plain().flag).toBe(false);
  });

  it('a secondary class in the same file registers its own interfaces', () => {
    const r = translate('package p { public class A implements I { } }\nclass Hidden implements J { }', {
      shimNames: SHIM_AS3_NAMES, selfQualified: 'p.A', siblingClasses: new Set(['p.I', 'p.J', 'p.A']) as never, syntaxCheck: tsSyntaxCheck,
    });
    expect(r.text).toContain('declareImplements(A, I);');
    expect(r.text).toContain('declareImplements(Hidden, J);');
  });

  it('an implements name with no source file stays a type in the clause and is left out of declareImplements', () => {
    const r = translate('package p { import flash.events.IEventDispatcher; public class C implements IEventDispatcher { } }', {
      shimNames: SHIM_AS3_NAMES, selfQualified: 'p.C', siblingClasses: new Set(['p.C']) as never, syntaxCheck: tsSyntaxCheck,
    });
    expect(r.text).toContain('export class C implements IEventDispatcher {');
    expect(r.text).not.toContain('declareImplements');
    const mixed = translate('package p { import flash.events.IEventDispatcher; public class C implements I, IEventDispatcher { } }', {
      shimNames: SHIM_AS3_NAMES, selfQualified: 'p.C', siblingClasses: new Set(['p.I', 'p.C']) as never, syntaxCheck: tsSyntaxCheck,
    });
    expect(mixed.text).toContain('declareImplements(C, I);');
  });

  it('a class without implements gets no declareImplements and no Shim import for it', () => {
    const r = translate('package p { public class C { } }', { shimNames: SHIM_AS3_NAMES, selfQualified: 'p.C', siblingClasses: new Set(['p.C']) as never, syntaxCheck: tsSyntaxCheck });
    expect(r.text).not.toContain('declareImplements');
  });

  it('x as I stays a plain cast (decision D33: no run-time check, no null on mismatch)', () => {
    const r = translate('package p { public class C { public function f(x:Object):void { var y:I = x as I; } } }', {
      shimNames: SHIM_AS3_NAMES, selfQualified: 'p.C', siblingClasses: new Set(['p.I', 'p.C']) as never, syntaxCheck: tsSyntaxCheck,
    });
    expect(r.text).toContain('var y: I = x as I;');
  });
});
// The local copy of slider_component (Requirement 23.6, 27.5); skipped with a reason when Java, FFDec or the copy is absent.
const sliderSwf = resolve(repoRoot, '.work/local/slider_component/test.swf');
const sliderSkip: string | null = !existsSync(sliderSwf)
  ? '.work/local/slider_component/test.swf is absent'
  : spawnSync('java', ['-version'], { windowsHide: true }).status !== 0
    ? 'Java is not available on PATH'
    : !existsSync(resolve(repoRoot, 'tools/ffdec/ffdec-cli.jar'))
      ? 'tools/ffdec is absent'
      : null;
const sliderTmp: string[] = [];
afterAll(() => {
  for (const d of sliderTmp) rmSync(d, { recursive: true, force: true });
});

describe('slider_component interfaces (Requirement 27.5, Task 24.4)', () => {
  it.skipIf(sliderSkip !== null)(
    `no class-omitted entry has reason missing-export for an interface${sliderSkip === null ? '' : ` (skipped: ${sliderSkip})`}`,
    async () => {
      const out = mkdtempSync(join(tmpdir(), 'swf-resurrect-iface-'));
      sliderTmp.push(out);
      expect(await main([sliderSwf, join(out, 'p'), '--force'])).toBe(0);
      const report = JSON.parse(readFileSync(join(out, 'p', 'translation-report.json'), 'utf8')) as {
        omittedClasses: { className: string; reason: { kind: string } }[];
        classes: { className: string; omitted: boolean }[];
      };
      const interfaces = ['fl.managers.IFocusManager', 'fl.managers.IFocusManagerComponent', 'fl.managers.IFocusManagerGroup'];
      expect(report.omittedClasses.filter((o) => o.reason.kind === 'missing-export')).toEqual([]);
      for (const n of interfaces) expect(report.classes.find((c) => c.className === n)).toMatchObject({ omitted: false });
      const registry = readFileSync(join(out, 'p', 'src', 'classes.ts'), 'utf8');
      for (const n of interfaces) expect(registry).not.toContain(`"${n}"`); // interfaces are not linked classes
    },
    10 * 60 * 1000,
  );
});