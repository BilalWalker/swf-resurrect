import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { serialiseScene } from '../../src/convert/sceneJson';
import { planEmitDetailed } from '../../src/emit/planEmit';
import type { TemplateFile } from '../../src/emit/planEmit';
import { exportedNames } from '../../src/emit/exportedNames';
import { planTranslate } from '../../src/translate/planTranslate';
import { untranslatedCodeEntries } from '../../src/translate/report';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
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
