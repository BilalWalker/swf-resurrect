import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReport } from '../../src/translate/report';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import type { SceneJson } from '../../template/runtime/scene';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import { serialiseScene } from '../../src/convert/sceneJson';
import { emit } from '../../src/emit/emit';
import { EmitWriteError, OutputDirNotEmptyError } from '../../src/emit/errors';
import { planEmit, planEmitDetailed } from '../../src/emit/planEmit';
import type { EmitInput } from '../../src/emit/planEmit';

const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const noCt: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];

const scene: SceneJson = {
  formatVersion: 1,
  stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite',
      frameCount: 1,
      labels: [],
      frames: [[{ depth: 1, symbolId: 3, matrix: identity, colorTransform: noCt, name: 'l_button' }]],
    },
    '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } },
    '3': {
      type: 'sprite',
      className: 'LeftButton',
      frameCount: 1,
      labels: [],
      frames: [[{ depth: 1, symbolId: 1, matrix: identity, colorTransform: noCt, name: '' }]],
    },
  },
};

const input: EmitInput = {
  scene,
  sceneJson: serialiseScene(scene),
  // Deliberately unsorted, with CRLF, a .gitkeep and the static default classes.ts.
  templates: [
    { path: 'vite.config.ts', content: 'a\r\nb\r\n' },
    { path: 'src/classes.ts', content: 'STATIC' },
    { path: 'src/.gitkeep', content: '' },
    { path: 'index.html', content: '<html></html>\n' },
    { path: 'runtime/pixi/pixiBackend.ts', content: 'x\n' },
  ],
  translated: [],
  handwritten: [
    { className: 'RightButton', fileName: 'RightButton.ts', source: 'unlinked\n' },
    { className: 'LeftButton', fileName: 'LeftButton.ts', source: 'left\r\n' },
  ],
};
const svgs = [{ fileName: '1.svg', content: '<svg/>\r\n' }];

describe('planEmit', () => {
  it('produces the expected sorted paths', () => {
    const paths = planEmit(input, svgs).map((f) => f.path);
    expect(paths).toEqual([
      'assets/1.svg',
      'assets/scene.json',
      'index.html',
      'package.json',
      'runtime/pixi/pixiBackend.ts',
      'src/LeftButton.ts',
      'src/classes.ts',
      'vite.config.ts',
    ]);
  });

  it('is deterministic, and independent of template order', () => {
    const a = planEmit(input, svgs);
    const b = planEmit({ ...input, templates: [...input.templates].reverse() }, svgs);
    expect(b).toEqual(a);
  });

  it('replaces the static classes.ts with a generated registry for linked classes only', () => {
    const files = planEmit(input, svgs);
    const classes = files.filter((f) => f.path === 'src/classes.ts');
    expect(classes).toHaveLength(1);
    expect(classes[0].content).toContain("import { LeftButton } from './LeftButton';");
    expect(classes[0].content).toContain('"LeftButton": LeftButton,');
    expect(classes[0].content).not.toContain('RightButton');
    expect(classes[0].content).not.toContain('STATIC');
  });

  it('4.4 writes an empty typed registry when no class exists, and it type-checks', () => {
    const noClassScene: SceneJson = {
      ...scene,
      symbols: {
        '0': { type: 'sprite', frameCount: 1, labels: [], frames: [[]] },
        '1': scene.symbols['1'],
      },
    };
    const files = planEmit(
      { ...input, scene: noClassScene, sceneJson: serialiseScene(noClassScene), handwritten: [] },
      svgs,
    );
    const classes = files.find((f) => f.path === 'src/classes.ts');
    expect(classes?.content).toContain('export const classRegistry: Record<string, never> = {};');
    expect(classes?.content).not.toContain('import ');

    const gate = typeCheckProject({
      files: new Map([
        ['tsconfig.json', readFileSync(resolve(__dirname, '../../template/tsconfig.json'), 'utf8')],
        ['src/classes.ts', classes?.content ?? ''],
      ]),
      repoRoot: resolve(__dirname, '../..'),
    });
    expect(gate.errors).toEqual([]);
  });

  it('4.3 an omitted class has no import and no entry, and its file is still written', () => {
    const omittedInput: EmitInput = { ...input, translated: [{ className: 'LeftButton', fileName: 'LeftButton.ts', text: 'x\n', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [] }], handwritten: [] };
    const files = planEmitDetailed(omittedInput, svgs, new Set(['LeftButton'])).files;
    const classes = files.find((f) => f.path === 'src/classes.ts');
    expect(files.some((f) => f.path === 'src/LeftButton.ts')).toBe(true);
    expect(classes?.content).not.toContain('LeftButton');
    expect(classes?.content).toContain('export const classRegistry: Record<string, never> = {};');
    expect(planEmitDetailed(omittedInput, svgs).files.find((f) => f.path === 'src/classes.ts')?.content).toContain('LeftButton');
  });

  it('4.4 the Translation_Report holds zero classes when none exist', () => {
    const report = buildReport([], null);
    expect(report.classes).toEqual([]);
    expect(report.otherErrors).toEqual([]);
  });

  it('uses LF line endings only', () => {
    for (const f of planEmit(input, svgs)) expect(f.content).not.toContain('\r');
  });
});

describe('emit', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'emit-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function artifact(): Promise<ConvertedArtifact> {
    const assets = join(root, 'staging', 'assets');
    await mkdir(assets, { recursive: true });
    const svg = join(assets, '1.svg');
    await writeFile(svg, '<svg/>\n', 'utf8');
    return {
      stagingDir: join(root, 'staging'),
      scenePath: join(assets, 'scene.json'),
      svgPaths: [svg],
      scene,
      unsupported: [],
      stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 },
    };
  }

  async function options(outputDir: string) {
    const templateDir = join(root, 'tpl');
    await mkdir(join(templateDir, 'src'), { recursive: true });
    await writeFile(join(templateDir, 'index.html'), '<html></html>\n');
    await writeFile(join(templateDir, 'src', 'classes.ts'), 'STATIC');
    return {
      outputDir,
      force: false,
      swfPath: join(root, 'x.swf'),
      cwd: root,
      homeDir: root,
      templateDir,
      handwrittenDir: null,
    };
  }

  it('writes the planned files into a new directory', async () => {
    const out = join(root, 'out', 'nested');
    const result = await emit(await artifact(), await options(out));
    expect(result.files).toEqual([
      'assets/1.svg',
      'assets/scene.json',
      'index.html',
      'package.json',
      'src/classes.ts',
    ]);
    expect(await readFile(join(out, 'src', 'classes.ts'), 'utf8')).not.toContain('STATIC');
    expect(await readFile(join(out, 'assets', 'scene.json'), 'utf8')).toBe(serialiseScene(scene));
  });

  it('walks the override directory recursively and matches a/b/Cls.ts to a.b.Cls', async () => {
    const hw = join(root, 'hw');
    await mkdir(join(hw, 'a', 'b'), { recursive: true });
    await writeFile(join(hw, 'a', 'b', 'Cls.ts'), 'nested\n');
    await writeFile(join(hw, 'LeftButton.ts'), 'left\n');
    await writeFile(join(hw, '.gitkeep'), '');
    const s: SceneJson = {
      ...scene,
      symbols: { ...scene.symbols, '4': { type: 'sprite', className: 'a.b.Cls', frameCount: 1, labels: [], frames: [[]] } },
    };
    const art = { ...(await artifact()), scene: s };
    const out = join(root, 'out-hw');
    const result = await emit(art, { ...(await options(out)), handwrittenDir: hw });
    expect(result.files).toContain('src/a/b/Cls.ts');
    expect(result.files).toContain('src/LeftButton.ts');
    expect(result.classPaths.map((c) => c.className)).toEqual(['LeftButton', 'a.b.Cls']);
    expect(await readFile(join(out, 'src', 'a', 'b', 'Cls.ts'), 'utf8')).toBe('nested\n');
  });
  it('refuses a non-empty directory without force and leaves it untouched', async () => {
    const out = join(root, 'out');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'keep.txt'), 'mine', 'utf8');
    await expect(emit(await artifact(), await options(out))).rejects.toBeInstanceOf(OutputDirNotEmptyError);
    expect(await readdir(out)).toEqual(['keep.txt']);
    expect(await readFile(join(out, 'keep.txt'), 'utf8')).toBe('mine');
  });

  it('removes this run\'s files and directories when a write fails, and reports no success', async () => {
    const out = join(root, 'made', 'by', 'run');
    let calls = 0;
    const opts = {
      ...(await options(out)),
      writeFile: async (p: string, c: string) => {
        calls += 1;
        if (calls === 3) throw new Error('disk full');
        await writeFile(p, c, 'utf8');
      },
    };
    const err = await emit(await artifact(), opts).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EmitWriteError);
    expect((err as EmitWriteError).code).toBe('EMIT_WRITE_FAILED');
    expect((err as EmitWriteError).message).toContain('disk full');
    expect((err as EmitWriteError).message).toContain((err as EmitWriteError).path);
    expect(calls).toBe(3);
    expect(await readdir(root)).not.toContain('made');
  });

  it('keeps a pre-existing output directory and its parents when cleaning up', async () => {
    const out = join(root, 'out');
    await mkdir(out, { recursive: true });
    const opts = {
      ...(await options(out)),
      writeFile: async (p: string, c: string) => {
        if (p.endsWith('package.json')) throw new Error('boom');
        await writeFile(p, c, 'utf8');
      },
    };
    await expect(emit(await artifact(), opts)).rejects.toBeInstanceOf(EmitWriteError);
    expect(await readdir(out)).toEqual([]);
  });

  it('accepts an existing empty directory', async () => {
    const out = join(root, 'out');
    await mkdir(out, { recursive: true });
    const result = await emit(await artifact(), await options(out));
    expect(result.files).toContain('package.json');
  });
});

describe('planEmit: class paths', () => {
  const tc = (className: string, text = 'x\n') => ({ className, fileName: className + '.ts', text, diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [] });
  const sceneWith = (...names: string[]): SceneJson => ({
    ...scene,
    symbols: {
      ...scene.symbols,
      ...Object.fromEntries(names.map((n, i) => [String(10 + i), { type: 'sprite', className: n, frameCount: 1, labels: [], frames: [[]] }])),
    },
  });
  const planFor = (names: string[], extra: Partial<EmitInput> = {}) => {
    const s = sceneWith(...names);
    return planEmitDetailed(
      { ...input, scene: s, sceneJson: serialiseScene(s), translated: names.map((n) => tc(n)), handwritten: [], ...extra },
      svgs,
    );
  };

  it('writes a class named Main at src/Main.class.ts, registers it, and leaves src/main.ts alone', () => {
    const plan = planFor(['Main'], { templates: [...input.templates, { path: 'src/main.ts', content: 'boot\n' }] });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('src/Main.class.ts');
    expect(plan.files.find((f) => f.path === 'src/main.ts')?.content).toBe('boot\n');
    expect(plan.files.find((f) => f.path === 'src/classes.ts')?.content).toContain("import { Main } from './Main.class';");
    expect(plan.classPaths).toEqual([{ className: 'Main', originalPath: 'src/Main.ts', path: 'src/Main.class.ts' }]);
  });

  it('keeps main.Main and Main apart at the directory level', () => {
    const plan = planFor(['Main', 'main.Main'], { templates: [...input.templates, { path: 'src/main.ts', content: 'boot\n' }] });
    const paths = plan.classPaths.map((c) => c.path);
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(2);
    expect(paths).toEqual(['src/Main.class.ts', 'src/main/Main.ts']);
  });

  it('writes nested files and rewrites exactly the recorded import lines of translated text', () => {
    const s = sceneWith('a.b.Cls');
    const plan = planEmitDetailed(
      {
        ...input,
        scene: s,
        sceneJson: serialiseScene(s),
        handwritten: [],
        translated: [
          {
            ...tc('a.b.Cls', "import { X } from '../shim';\nimport { Cls } from '../shim';\n"),
            importRecords: [{ line: 1, kind: 'shim', names: [{ name: 'X' }] }],
          },
        ],
      } as EmitInput,
      svgs,
    );
    const file = plan.files.find((f) => f.path === 'src/a/b/Cls.ts');
    expect(file?.content).toBe("import { X } from '../../../shim';\nimport { Cls } from '../shim';\n");
  });

  it('matches a handwritten override by Qualified_Name and writes it unchanged', () => {
    const plan = planFor(['Main', 'a.b.Cls'], {
      templates: [...input.templates, { path: 'src/main.ts', content: 'boot\n' }],
      translated: [tc('Main'), tc('a.b.Cls')],
      handwritten: [
        { className: 'Main', fileName: 'Main.ts', source: 'mine\n' },
        { className: 'a.b.Cls', fileName: 'a/b/Cls.ts', source: 'nested\n' },
        { className: 'x.Gone', fileName: 'x/Gone.ts', source: 'gone\n' },
      ],
    });
    expect(plan.files.find((f) => f.path === 'src/Main.class.ts')?.content).toBe('mine\n');
    expect(plan.files.find((f) => f.path === 'src/a/b/Cls.ts')?.content).toBe('nested\n');
    expect(plan.warnings).toEqual(['Override x/Gone.ts ignored: x.Gone is not a linked or emitted class']);
  });

  it('has no class paths and an empty registry when there are no classes', () => {
    const plan = planEmitDetailed({ ...input, handwritten: [] }, svgs);
    expect(plan.classPaths).toEqual([]);
  });
});