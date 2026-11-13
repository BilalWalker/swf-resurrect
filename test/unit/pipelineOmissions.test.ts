// Task 23.3: the Pipeline runs the Bundler_Guard on the planned final text before it decides the omitted set.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import { checkClassFiles } from '../../src/emit/bundlerGuard';
import type { BundlerCheckData } from '../../src/emit/classOmissions';
import { emit } from '../../src/emit/emit';
import { buildClassesTs } from '../../src/emit/planEmit';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { emitFixtureProject } from '../support/emitFixtureProject';

const REPO_ROOT = join(__dirname, '..', '..');
const m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const ct: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];
const sprite = (className?: string) => ({
  type: 'sprite' as const,
  ...(className === undefined ? {} : { className }),
  frameCount: 1,
  labels: [],
  frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
});
const scene: SceneJson = {
  formatVersion: 1,
  stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': sprite(),
    '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } },
    '2': sprite('Broken'),
    '3': sprite('Child'),
    '4': sprite('Fine'),
    '5': sprite('Hand'),
  },
};

const tc = (className: string, text: string, extendsName: string | null = null, imports: string[] = []): TranslatedClass => ({
  className,
  fileName: `${className}.ts`,
  text,
  diagnostics: [],
  spans: [],
  extendsName,
  extendsQualified: extendsName,
  importRecords: imports.map((target, i) => ({
    line: i + 1,
    kind: 'class' as const,
    names: [{ name: target }],
    target,
  })),
});
const classes = [
  tc('Broken', 'export class Broken { x = ; }\n'),
  tc('Child', "import { Broken } from './Broken';\nexport class Child extends Broken {}\n", 'Broken', ['Broken']),
  tc('Fine', 'export class Fine {}\n'),
  tc('Hand', 'export class Hand {}\n'),
];

const ok: BundlerCheckData = { verdict: { ok: true }, imports: [] };
const fail = (message: string, line = 3, column = 7): BundlerCheckData => ({
  verdict: { ok: false, phase: 'parse', message, line, column },
  imports: [],
});

let tmp: string;
let out: string;
let err: string;
const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pipe-omit-'));
  out = '';
  err = '';
  await mkdir(join(tmp, 'tpl', 'src'), { recursive: true });
  await writeFile(join(tmp, 'tpl', 'src', 'main.ts'), 'export {};\n');
  await writeFile(join(tmp, 'tpl', 'tsconfig.json'), await readFile(join(REPO_ROOT, 'template', 'tsconfig.json'), 'utf8'));
  await writeFile(join(tmp, 'a.swf'), 'FWS');
  await writeFile(join(tmp, '1.svg'), '<svg/>\n');
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function stages(guard: PipelineStages['guard'], translated: TranslatedClass[] = classes): PipelineStages {
  return {
    async unpack() {
      return {} as never;
    },
    async convert() {
      return {
        stagingDir: tmp,
        scenePath: join(tmp, 'scene.json'),
        svgPaths: [join(tmp, '1.svg')],
        scene,
        unsupported: [],
        stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 },
      } as ConvertedArtifact;
    },
    async translate() {
      return { classes: translated, skippedScripts: [] };
    },
    emit,
    gate: (files) => typeCheckProject({ files, repoRoot: REPO_ROOT }),
    ...(guard === undefined ? {} : { guard }),
    async typeCheck() {
      return { errors: [] };
    },
  };
}

function args(over: Partial<PipelineArgs> = {}): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'),
    outputDir: join(tmp, 'project'),
    force: false,
    workDir: join(tmp, 'work'),
    keepWork: true,
    ffdecJarPath: 'jar',
    templateDir: join(tmp, 'tpl'),
    handwrittenDir: null,
    handwrittenClasses: [],
    cwd: tmp,
    homeDir: tmp,
    ...over,
  };
}

const readJson = async (name: string): Promise<any> => JSON.parse(await readFile(join(tmp, 'project', name), 'utf8'));
const registryKeys = (text: string): string[] => [...text.matchAll(/^ {2}"(\w+)":/gm)].map((x) => x[1]);

describe('pipeline: the Bundler_Guard decides omissions', { timeout: 60000 }, () => {
  it('omits a class whose check fails and its dependants, with the position in the reports', async () => {
    const seen: string[][] = [];
    const guard: PipelineStages['guard'] = async (files) => {
      seen.push([...files.keys()]);
      return new Map([...files.keys()].map((p) => [p, p === 'src/Broken.ts' ? fail("The keyword 'yield' is reserved") : ok]));
    };
    expect(await runPipeline(args(), stages(guard), io)).toBe(0);
    expect(seen).toEqual([['src/Broken.ts', 'src/Child.ts', 'src/Fine.ts', 'src/Hand.ts']]);
    const report = await readJson('translation-report.json');
    const by = Object.fromEntries(report.omittedClasses.map((o: any) => [o.className, o.reason]));
    expect(by.Broken).toEqual({ kind: 'bundler-parse', phase: 'parse', message: "The keyword 'yield' is reserved", line: 3, column: 7 });
    expect(by.Child).toEqual({ kind: 'extends-omitted', base: 'Broken' });
    expect(Object.keys(by).sort()).toEqual(['Broken', 'Child']);
    const entry = report.classes.find((c: any) => c.className === 'Broken');
    expect(entry.omitted).toBe(true);
    expect(entry.diagnostics.find((d: any) => d.kind === 'class-omitted')).toMatchObject({
      line: 3,
      message: expect.stringContaining("Vite cannot parse the file: The keyword 'yield' is reserved (line 3, column 7, in the transformed text)"),
    });
    expect(report.problems).toBeUndefined();
    const unsupported = await readJson('unsupported-features.json');
    const listed = (unsupported.entries ?? unsupported).filter((e: any) => e.kind === 'class-omitted' && e.tag === 'Broken');
    expect(listed).toHaveLength(1);
    expect(listed[0].message).toContain('Vite cannot parse the file');
    expect(registryKeys(await readFile(join(tmp, 'project', 'src', 'classes.ts'), 'utf8'))).toEqual(['Fine', 'Hand']);
    expect(await readFile(join(tmp, 'project', 'src', 'Broken.ts'), 'utf8')).toContain('class Broken');
  });

  it('falls back to the Requirement 23 rules and records the Problem when the guard cannot run', async () => {
    const guard: PipelineStages['guard'] = async () => {
      throw new Error('cannot load vite: nope');
    };
    expect(await runPipeline(args(), stages(guard), io)).toBe(0);
    const report = await readJson('translation-report.json');
    expect(report.problems).toEqual([{ kind: 'bundler-guard-unavailable', message: 'cannot load vite: nope' }]);
    const by = Object.fromEntries(report.omittedClasses.map((o: any) => [o.className, o.reason.kind]));
    expect(by).toEqual({ Broken: 'syntax-error', Child: 'extends-omitted' });
    expect(err).toContain('warn [emit]: the bundler guard could not run');
  });

  it('keeps a class with a syntactic diagnostic while the guard says ok', async () => {
    const guard: PipelineStages['guard'] = async (files) => new Map([...files.keys()].map((p) => [p, ok]));
    expect(await runPipeline(args(), stages(guard), io)).toBe(0);
    const report = await readJson('translation-report.json');
    expect(report.omittedClasses).toEqual([]);
    expect(report.classes.find((c: any) => c.className === 'Broken').loose).toBe(true);
  });

  it('runs the old rules when no guard is injected, without a Problem', async () => {
    expect(await runPipeline(args(), stages(undefined), io)).toBe(0);
    const report = await readJson('translation-report.json');
    expect(report.omittedClasses.map((o: any) => o.reason.kind)).toEqual(['syntax-error', 'extends-omitted']);
    expect(report.problems).toBeUndefined();
  });
});

describe('pipeline: a handwritten override that fails the guard is loud', { timeout: 60000 }, () => {
  async function withOverride(text: string): Promise<string> {
    const hw = join(tmp, 'hw');
    await mkdir(hw, { recursive: true });
    await writeFile(join(hw, 'Hand.ts'), text);
    return hw;
  }

  it('omits it with a Problem, one warn line and the file still written (stub guard)', async () => {
    const hw = await withOverride('export class Hand {}\n');
    const guard: PipelineStages['guard'] = async (files) =>
      new Map([...files.keys()].map((p) => [p, p === 'src/Hand.ts' ? fail('Unexpected token', 1, 8) : ok]));
    expect(await runPipeline(args({ handwrittenDir: hw, handwrittenClasses: ['Hand'] }), stages(guard, [classes[2]]), io)).toBe(0);
    const report = await readJson('translation-report.json');
    expect(report.problems).toEqual([
      { kind: 'handwritten-override-unparsable', path: 'Hand.ts', message: 'Unexpected token', line: 1, column: 8 },
    ]);
    expect(report.omittedClasses.filter((o: any) => o.reason.kind !== 'missing-source').map((o: any) => [o.className, o.reason.kind])).toEqual([['Hand', 'bundler-parse']]);
    const lines = err.split('\n').filter((l) => l.startsWith('warn [emit]:'));
    expect(lines).toEqual([
      'warn [emit]: handwritten override Hand.ts does not parse with Vite and is left out of the registry: Unexpected token (line 1, column 8)',
    ]);
    expect(await readFile(join(tmp, 'project', 'src', 'Hand.ts'), 'utf8')).toBe('export class Hand {}\n');
    expect(registryKeys(await readFile(join(tmp, 'project', 'src', 'classes.ts'), 'utf8'))).toEqual(['Fine']);
  });

  it('does the same with the real guard on a file that holds `with ({}) {}`', async () => {
    const hw = await withOverride('export class Hand {\n  run(): void {\n    with ({}) {}\n  }\n}\n');
    expect(await runPipeline(args({ handwrittenDir: hw, handwrittenClasses: ['Hand'] }), stages(checkClassFiles, [classes[2]]), io)).toBe(0);
    const report = await readJson('translation-report.json');
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatchObject({ kind: 'handwritten-override-unparsable', path: 'Hand.ts' });
    expect(report.problems[0].message).toMatch(/with/i);
    expect(err).toContain(`warn [emit]: handwritten override Hand.ts does not parse with Vite and is left out of the registry: ${report.problems[0].message}`);
    expect((await readFile(join(tmp, 'project', 'src', 'Hand.ts'), 'utf8')).includes('with ({})')).toBe(true);
  });
});

describe('pipeline: src/classes.ts of the samples with the real guard', () => {
  it.each(['clickgoto', 'tweendemo'] as const)('%s is byte-identical', async (sample) => {
    const fx = await emitFixtureProject(sample, (files) => typeCheckProject({ files, repoRoot: REPO_ROOT }), checkClassFiles);
    try {
      const names = Object.values(fx.scene.symbols).flatMap((s) => (s.type === 'sprite' && s.className !== undefined ? [s.className] : []));
      const text = await readFile(join(fx.projectDir, 'src', 'classes.ts'), 'utf8');
      expect(text).toBe(buildClassesTs(fx.scene, names));
    } finally {
      await fx.dispose();
    }
  }, 120000);
});
