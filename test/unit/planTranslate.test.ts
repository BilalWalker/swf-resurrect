import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import type { UnpackResult } from '../../src/unpack/unpack';
import { PipelineError } from '../../src/pipeline/errors';
import { DuplicateClassError, ScriptsDirError } from '../../src/translate/errors';
import { planTranslate } from '../../src/translate/planTranslate';
import { translateStage } from '../../src/translate/translateStage';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

function sceneWith(classNames: string[]): SceneJson {
  const symbols: Record<string, unknown> = {};
  classNames.forEach((c, i) => {
    symbols[String(i)] = { type: 'sprite', frames: [], labels: {}, className: c };
  });
  return { formatVersion: 1, rootSymbolId: 0, symbols } as unknown as SceneJson;
}

const cls = (name: string, base?: string) =>
  `package {\n  public class ${name}${base ? ` extends ${base}` : ''} {\n    public function ${name}() {\n    }\n  }\n}\n`;

describe('planTranslate', () => {
  it('adds the base class of a linked class', () => {
    const r = planTranslate(
      [
        { className: 'A', source: cls('A', 'B') },
        { className: 'B', source: cls('B') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['A', 'B']);
  });

  it('follows a chain of two bases', () => {
    const r = planTranslate(
      [
        { className: 'A', source: cls('A', 'B') },
        { className: 'B', source: cls('B', 'C') },
        { className: 'C', source: cls('C') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['A', 'B', 'C']);
  });

  it('skips an unlinked class that is nobody\'s base', () => {
    const r = planTranslate(
      [
        { className: 'A', source: cls('A') },
        { className: 'Z', source: cls('Z') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['A']);
  });

  const timeline = (pkg: string, body: string) =>
    `package ${pkg} {\n  import flash.display.MovieClip;\n  public class MainTimeline extends MovieClip {\n    public function MainTimeline() { addFrameScript(0, this.frame1); }\n    internal function frame1():* { ${body} }\n  }\n}\n`;

  it('adds a root-package class referenced only from a frame script of a packaged class', () => {
    const r = planTranslate(
      [
        { className: 'test_fla.MainTimeline', source: timeline('test_fla', 'new Test(this);') },
        { className: 'Test', source: cls('Test') },
        { className: 'Unused', source: cls('Unused') },
      ],
      sceneWith(['test_fla.MainTimeline']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['Test', 'test_fla.MainTimeline']);
    expect(r.classes[1].text).toContain("import { Test } from '../Test';");
  });

  it('adds a same-package class named without an import, and what that class names in turn', () => {
    const r = planTranslate(
      [
        { className: 'p.MainTimeline', source: timeline('p', 'new Helper(this);') },
        { className: 'p.Helper', source: 'package p {\n  public class Helper {\n    public function Helper(x:*) { new Deep(); }\n  }\n}\n' },
        { className: 'Deep', source: cls('Deep') },
        { className: 'p.Other', source: 'package p {\n  public class Other {\n  }\n}\n' },
      ],
      sceneWith(['p.MainTimeline']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['Deep', 'p.Helper', 'p.MainTimeline']);
  });

  it('emits EventWatcher for the clickgoto fixtures', () => {
    const dir = join(__dirname, '..', 'fixtures', 'clickgoto', 'scripts');
    const names = ['EventWatcher', 'LeftButton', 'MainTimeline', 'RightButton'];
    const sources = names.map((n) => ({ className: n, source: readFileSync(join(dir, `${n}.as`), 'utf8') }));
    const r = planTranslate(sources, sceneWith(['MainTimeline', 'LeftButton', 'RightButton']), tsSyntaxCheck);
    expect(r.classes.map((c) => c.className)).toEqual(names);
    expect(r.classes[0].fileName).toBe('EventWatcher.ts');
  });
});

// Robustness task 31.2 (D-E2): a class named only by a string literal in a reached class is a candidate.
// Validates: Requirements 27.5, 27.6
describe('planTranslate: classes named by a string (D-E2)', () => {
  const withBody = (pkg: string, name: string, body: string, imports = '') =>
    `package ${pkg} {\n  import flash.display.MovieClip;\n  import flash.utils.getDefinitionByName;\n${imports}  public class ${name} extends MovieClip {\n    public function ${name}() {\n      ${body}\n    }\n  }\n}\n`;
  /** A two-frame preloader: frame 1 links Preloader, which creates the main class by name. */
  const preloader = (literal: string) =>
    withBody('', 'Preloader', `nextFrame(); var c:Class = getDefinitionByName(${literal}) as Class; addChild(new c());`);
  const names = (r: ReturnType<typeof planTranslate>) => r.classes.map((c) => c.className);
  const game = [
    { className: 'game.Main', source: withBody('game', 'Main', 'new Helper();') },
    { className: 'game.Helper', source: 'package game {\n  public class Helper {\n  }\n}\n' },
    { className: 'Unused', source: cls('Unused') },
  ];

  it('reaches the class a literal names, and what that class names in turn; an unnamed class stays out', () => {
    const r = planTranslate([{ className: 'Preloader', source: preloader('"game.Main"') }, ...game], sceneWith(['Preloader']), tsSyntaxCheck);
    expect(names(r)).toEqual(['Preloader', 'game.Helper', 'game.Main']);
  });

  it('reads the package forms pkg.Name and pkg::Name, and folds a concatenation of literals', () => {
    for (const lit of ['"game::Main"', "'game.' + 'Main'", '"game" + "::Main"']) {
      const r = planTranslate([{ className: 'Preloader', source: preloader(lit) }, ...game], sceneWith(['Preloader']), tsSyntaxCheck);
      expect(names(r)).toContain('game.Main');
    }
  });

  it('misses a name built at run time and a name in a comment', () => {
    const src = withBody('', 'Preloader', 'var n:String = "game." + suffix(); getDefinitionByName(n); // "game.Main"\n      /* "game.Main" */');
    const r = planTranslate([{ className: 'Preloader', source: src }, ...game], sceneWith(['Preloader']), tsSyntaxCheck);
    expect(names(r)).toEqual(['Preloader']);
  });

  it('keeps the old closure under the symbols rule and every class under the all rule', () => {
    const sources = [{ className: 'Preloader', source: preloader('"game.Main"') }, ...game];
    expect(names(planTranslate(sources, sceneWith(['Preloader']), tsSyntaxCheck, [], undefined, 'symbols'))).toEqual(['Preloader']);
    expect(names(planTranslate(sources, sceneWith(['Preloader']), tsSyntaxCheck, [], undefined, 'all'))).toEqual(['Preloader', 'Unused', 'game.Helper', 'game.Main']);
  });

  it('ends on a cycle of names', () => {
    const r = planTranslate(
      [
        { className: 'A', source: withBody('', 'A', 'getDefinitionByName("B");') },
        { className: 'B', source: withBody('', 'B', 'getDefinitionByName("A");') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(names(r)).toEqual(['A', 'B']);
  });

  it('reports a reached class whose translation fails', () => {
    const broken = 'package game {\n  public class Main {\n    public function Main() {\n      §§push(1);\n    }\n  }\n}\n';
    const r = planTranslate([{ className: 'Preloader', source: preloader('"game.Main"') }, { className: 'game.Main', source: broken }], sceneWith(['Preloader']), tsSyntaxCheck);
    const main = r.classes.find((c) => c.className === 'game.Main');
    expect(main).toBeDefined();
    expect(main?.parseFailed === true || (main?.diagnostics.length ?? 0) > 0).toBe(true);
  });

  it('gives the same classes and texts for any order of the sources', () => {
    const sources = [{ className: 'Preloader', source: preloader('"game.Main"') }, ...game];
    const a = planTranslate(sources, sceneWith(['Preloader']), tsSyntaxCheck);
    const b = planTranslate([...sources].reverse(), sceneWith(['Preloader']), tsSyntaxCheck);
    expect(b).toEqual(a);
  });
});

describe('translateStage errors', () => {
  const artifact = { scene: sceneWith([]) } as unknown as ConvertedArtifact;
  const unpackedAt = (scriptsDir: string) => ({ scriptsDir }) as unknown as UnpackResult;

  it('throws ScriptsDirError for a missing directory', async () => {
    const err = await translateStage(unpackedAt(join(tmpdir(), 'no-such-dir-translate-test')), artifact).catch((e) => e);
    expect(err).toBeInstanceOf(ScriptsDirError);
    expect(err).toBeInstanceOf(PipelineError);
    expect(err.stage).toBe('translate');
  });

  it('does not throw for the same simple name in the unnamed package and in a package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'translate-dup-'));
    try {
      await mkdir(join(root, 'p'), { recursive: true });
      await writeFile(join(root, 'A.as'), cls('A'));
      await writeFile(join(root, 'p', 'A.as'), 'package p {\n  public class A {\n  }\n}\n');
      const r = await translateStage(unpackedAt(root), { scene: sceneWith(['A', 'p.A']) } as unknown as ConvertedArtifact);
      expect(r.classes.map((c) => c.className)).toEqual(['A', 'p.A']);
      expect(r.skippedScripts).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips a script whose path gives no Qualified_Name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'translate-skip-'));
    try {
      await writeFile(join(root, 'A.as'), cls('A'));
      await writeFile(join(root, 'B.C.as'), cls('B'));
      const r = await translateStage(unpackedAt(root), { scene: sceneWith(['A']) } as unknown as ConvertedArtifact);
      expect(r.classes.map((c) => c.className)).toEqual(['A']);
      expect(r.skippedScripts).toEqual(['B.C.as']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('planTranslate: implicit this (Requirement 22)', () => {
  const uic = 'package fl.core\n{\n  import flash.display.Sprite;\n  public class UIComponent extends Sprite\n  {\n    public static function mergeStyles(a:int):int { return a; }\n    public var size:int;\n    protected function draw():void { }\n  }\n}\n';
  const mid = 'package fl.controls\n{\n  import fl.core.UIComponent;\n  public class BaseButton extends UIComponent\n  {\n    public static var count:int;\n  }\n}\n';
  const leaf =
    'package fl.controls\n{\n  public class LabelButton extends BaseButton\n  {\n    private var n:int;\n' +
    '    public function LabelButton() { }\n' +
    '    public function f():int { n = size + 1; draw(); count++; return mergeStyles(n); }\n' +
    '    public static function g():int { return mergeStyles(1) + n; }\n  }\n}\n';
  const sources = [
    { className: 'fl.core.UIComponent', source: uic },
    { className: 'fl.controls.BaseButton', source: mid },
    { className: 'fl.controls.LabelButton', source: leaf },
  ];
  const translate = (list: typeof sources) =>
    planTranslate(list, sceneWith(['fl.controls.LabelButton']), tsSyntaxCheck).classes.find((c) => c.className === 'fl.controls.LabelButton')!;

  it('resolves an inherited static to its declaring class and imports that class once', () => {
    const c = translate(sources);
    expect(c.text).toContain('return UIComponent.mergeStyles(this.n);');
    expect(c.text).toContain('this.n = this.size + 1;');
    expect(c.text).toContain('this.draw();');
    expect(c.text).toContain('BaseButton.count++;');
    expect(c.importRecords.filter((r) => r.kind === 'class' && r.target === 'fl.core.UIComponent')).toHaveLength(1);
    expect(c.text).toContain("import { UIComponent } from '../core/UIComponent';");
  });

  it('gives the static-context message for an instance member in a static method', () => {
    const c = translate(sources);
    const d = c.diagnostics.filter((x) => x.kind === 'unresolved-identifier');
    expect(d.map((x) => x.message)).toEqual(['"n" is an instance member of LabelButton and cannot be used in a static context']);
    expect(c.text).toContain('return UIComponent.mergeStyles(1) + n;');
  });

  it('does not depend on the order of the sources', () => {
    expect(translate([...sources].reverse()).text).toBe(translate(sources).text);
  });

  it('reports an unknown name once with the unknown-base message', () => {
    const c = planTranslate(
      [{ className: 'A', source: 'package { public class A extends Missing { public function f():void { nope(); } } }' }],
      sceneWith(['A']),
      tsSyntaxCheck,
    ).classes[0];
    expect(c.diagnostics.filter((x) => x.kind === 'unresolved-identifier').map((x) => x.message)).toEqual([
      '"nope" cannot be resolved: the base class "Missing" of A has neither a source nor a Shim class',
    ]);
  });
});
