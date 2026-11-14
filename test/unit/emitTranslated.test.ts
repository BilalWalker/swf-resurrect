import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { serialiseScene } from '../../src/convert/sceneJson';
import { emit } from '../../src/emit/emit';
import { buildClassesTs, planEmit, planEmitDetailed } from '../../src/emit/planEmit';
import type { EmitInput } from '../../src/emit/planEmit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translate } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { fixtureTables } from '../support/tables';

const m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const ct: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];
const sprite = (className: string) => ({
  type: 'sprite' as const,
  className,
  frameCount: 1,
  labels: [],
  frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
});
const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': sprite('MainTimeline'),
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    '2': sprite('LeftButton'),
    '4': sprite('RightButton'),
  },
};

const tc = (className: string, text = `// ${className}\n`): TranslatedClass => ({
  className,
  fileName: `${className}.ts`,
  text,
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
});
const translated = ['EventWatcher', 'LeftButton', 'MainTimeline', 'RightButton'].map((n) => tc(n));

const input = (over: Partial<EmitInput> = {}): EmitInput => ({
  scene,
  sceneJson: serialiseScene(scene),
  templates: [],
  translated,
  handwritten: [],
  ...over,
});

describe('buildClassesTs', () => {
  it('lists exactly the linked, available names sorted (EventWatcher is not registered)', () => {
    const text = buildClassesTs(scene, ['RightButton', 'EventWatcher', 'MainTimeline', 'LeftButton']);
    const keys = [...text.matchAll(/^ {2}"(\w+)":/gm)].map((x) => x[1]);
    expect(keys).toEqual(['LeftButton', 'MainTimeline', 'RightButton']);
    expect(text).not.toContain('EventWatcher');
  });

  it('imports from the chosen path with a binding and keys the registry by the dotted name', () => {
    const s = structuredClone(scene);
    s.symbols['90'] = { type: 'sprite', className: 'fl.controls.Slider', frameCount: 1, labels: [], frames: [[]] } as never;
    s.symbols['91'] = { type: 'sprite', className: 'Main', frameCount: 1, labels: [], frames: [[]] } as never;
    const text = buildClassesTs(
      s,
      ['fl.controls.Slider', 'Main'],
      new Set(),
      new Map([['fl.controls.Slider', 'src/fl/controls/Slider.ts'], ['Main', 'src/Main.class.ts']]),
    );
    expect(text).toContain("import { Slider as fl_controls_Slider } from './fl/controls/Slider';");
    expect(text).toContain("import { Main } from './Main.class';");
    expect(text).toContain('"fl.controls.Slider": fl_controls_Slider,');
  });
});

describe('planEmit with translated classes', () => {
  it('writes every translated class and registers the linked ones', () => {
    const files = planEmit(input(), []);
    const paths = files.map((f) => f.path).filter((p) => p.startsWith('src/'));
    expect(paths).toEqual([
      'src/EventWatcher.ts',
      'src/LeftButton.ts',
      'src/MainTimeline.ts',
      'src/RightButton.ts',
      'src/classes.ts',
    ]);
  });

  it('lets an override win over the translated text', () => {
    const files = planEmit(
      input({ handwritten: [{ className: 'LeftButton', fileName: 'LeftButton.ts', source: 'OVERRIDE\n' }] }),
      [],
    );
    expect(files.find((f) => f.path === 'src/LeftButton.ts')?.content).toBe('OVERRIDE\n');
    expect(files.find((f) => f.path === 'src/RightButton.ts')?.content).toBe('// RightButton\n');
  });

  it('ignores an unrelated override and warns', () => {
    const r = planEmitDetailed(
      input({ handwritten: [{ className: 'Other', fileName: 'Other.ts', source: 'x\n' }] }),
      [],
    );
    expect(r.files.some((f) => f.path === 'src/Other.ts')).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('Other.ts');
  });

  it('is deterministic and warns nothing without overrides', () => {
    const a = planEmitDetailed(input(), []);
    expect(planEmitDetailed(input({ translated: [...translated].reverse() }), [])).toEqual(a);
    expect(a.warnings).toEqual([]);
  });

  it('copies 0 files from an Override_Directory holding only .gitkeep', async () => {
    const root = await mkdtemp(join(tmpdir(), 'emit-override-'));
    try {
      const hw = join(root, 'hw');
      const tpl = join(root, 'tpl');
      await mkdir(hw, { recursive: true });
      await mkdir(tpl, { recursive: true });
      await writeFile(join(hw, '.gitkeep'), '');
      const svg = join(root, '1.shape.json');
      await writeFile(svg, '{"formatVersion":1,"paths":[]}\n');
      const out = join(root, 'out');
      const artifact = {
        stagingDir: root,
        scenePath: join(root, 'scene.json'),
        shapePaths: [svg], imagePaths: [],
        scene,
        unsupported: [],
        stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 },
      };
      const result = await emit(artifact, {
        outputDir: out,
        force: false,
        swfPath: join(root, 'x.swf'),
        cwd: root,
        homeDir: root,
        templateDir: tpl,
        translated,
        handwrittenDir: hw,
      });
      expect(result.warnings ?? []).toEqual([]);
      expect((await readdir(join(out, 'src'))).sort()).toEqual([
        'EventWatcher.ts',
        'LeftButton.ts',
        'MainTimeline.ts',
        'RightButton.ts',
        'classes.ts',
      ]);
      // Content is the translated text, so nothing came from the override directory.
      expect(result.files.filter((f) => f.startsWith('src/'))).toHaveLength(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('translated fixture classes (Requirement 18.15)', () => {
  for (const sample of ['clickgoto', 'tweendemo']) {
    it(`translates ${sample} byte-identically to the committed output`, () => {
      const dir = `test/fixtures/${sample}`;
      const names = readdirSync(`${dir}/scripts`).map((n) => n.slice(0, -3));
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) {
        const r = translate(readFileSync(`${dir}/scripts/${n}.as`, 'utf8'), {
          shimNames: SHIM_AS3_NAMES,
          tables: fixtureTables(dir),
          selfQualified: n,
          siblingClasses: new Set(names.filter((x) => x !== n)),
          syntaxCheck: tsSyntaxCheck,
        });
        expect(r.text).toBe(readFileSync(`${dir}/translated/${n}.ts.txt`, 'utf8'));
      }
    });
  }
});

describe('emitted fixture project (Requirement 18.15)', () => {
  for (const sample of ['clickgoto', 'tweendemo']) {
    it(`${sample}: paths, import lines and registry keys equal the committed bytes`, () => {
      const dir = `test/fixtures/${sample}`;
      const names = readdirSync(`${dir}/scripts`).map((n) => n.slice(0, -3)).sort();
      const classes = names.map((n) => {
        const text = readFileSync(`${dir}/translated/${n}.ts.txt`, 'utf8');
        const r = translate(readFileSync(`${dir}/scripts/${n}.as`, 'utf8'), {
          shimNames: SHIM_AS3_NAMES,
          tables: fixtureTables(dir),
          selfQualified: n,
          siblingClasses: new Set(names.filter((x) => x !== n)),
          syntaxCheck: tsSyntaxCheck,
        });
        return { ...tc(n, text), importRecords: r.importRecords };
      });
      const plan = planEmitDetailed(
        { scene, sceneJson: serialiseScene(scene), templates: [], translated: classes, handwritten: [] },
        [],
      );
      const srcFiles = plan.files.filter((f) => f.path.startsWith('src/') && f.path !== 'src/classes.ts');
      expect(srcFiles.map((f) => f.path)).toEqual(names.map((n) => `src/${n}.ts`));
      for (const f of srcFiles) {
        const n = f.path.slice(4, -3);
        const committed = readFileSync(`${dir}/translated/${n}.ts.txt`, 'utf8');
        expect(f.content).toBe(committed);
        // The import lines are the leading import statements; they are part of the bytes above.
        expect(f.content.split('\n').filter((l) => l.startsWith('import '))).toEqual(
          committed.split('\n').filter((l) => l.startsWith('import ')),
        );
      }
      const registry = plan.files.find((f) => f.path === 'src/classes.ts')?.content ?? '';
      expect([...registry.matchAll(/^ {2}"(\w+)":/gm)].map((x) => x[1])).toEqual([
        'LeftButton',
        'MainTimeline',
        'RightButton',
      ]);
      expect(registry).toContain("import { LeftButton } from './LeftButton';");
      expect(plan.classPaths.every((c) => c.path === c.originalPath)).toBe(true);
    });
  }
});
