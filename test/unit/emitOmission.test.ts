import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { emit } from '../../src/emit/emit';
import type { EmitOptions } from '../../src/emit/emit';
import { buildClassesTs } from '../../src/emit/planEmit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import type { GateResult } from '../../src/translate/typeCheckGate';
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
    '3': sprite('Loose'),
    '4': sprite('Thrower'),
    '5': sprite('Hand'),
    '6': sprite('Child'),
    '7': sprite('NoSource'),
    '8': sprite('other.Importer'),
  },
};

const tc = (
  className: string,
  text: string,
  extendsName: string | null = null,
  imports: string[] = [],
): TranslatedClass => ({
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
    names: [{ name: target.slice(target.lastIndexOf('.') + 1) }],
    target,
  })),
});
const classes = [
  tc('Broken', 'export class Broken { x = ; }\n'),
  tc('Loose', 'export class Loose { x: number = "s"; }\n'),
  tc('Thrower', "export class Thrower { constructor() { throw new Error('boom'); } }\n"),
  tc('Hand', 'export class Hand {}\n'),
  tc('Child', "import { Broken } from './Broken';\nexport class Child extends Broken {}\n", 'Broken', ['Broken']),
];

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'emit-omission-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(
  out: string,
  over: Partial<EmitOptions> = {},
  mainText = 'export {};\n',
): Promise<{ result: Awaited<ReturnType<typeof emit>>; gateRuns: number }> {
  const tpl = join(root, 'tpl');
  await mkdir(join(tpl, 'src'), { recursive: true });
  await writeFile(join(tpl, 'src', 'main.ts'), mainText);
  await writeFile(join(tpl, 'tsconfig.json'), await readFile(join(REPO_ROOT, 'template', 'tsconfig.json'), 'utf8'));
  const svg = join(root, '1.svg');
  await writeFile(svg, '<svg/>\n');
  let gateRuns = 0;
  const gate = (files: ReadonlyMap<string, string>): GateResult => {
    gateRuns++;
    return typeCheckProject({ files, repoRoot: REPO_ROOT });
  };
  const result = await emit(
    {
      stagingDir: root,
      scenePath: join(root, 'scene.json'),
      svgPaths: [svg],
      scene,
      unsupported: [],
      stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 },
    },
    {
      outputDir: out,
      force: false,
      swfPath: join(root, 'x.swf'),
      cwd: root,
      homeDir: root,
      templateDir: tpl,
      translated: classes,
      handwrittenDir: null,
      gate,
      ...over,
    },
  );
  return { result, gateRuns };
}

const real = (r: { omissions: { className: string; reason: { kind: string } }[] }): string[] =>
  r.omissions.filter((o) => o.reason.kind !== 'missing-source').map((o) => o.className);
const registryKeys = (text: string): string[] => [...text.matchAll(/^ {2}"(\w+)":/gm)].map((x) => x[1]);

describe('emit: gate first, plan again only when needed, write once', () => {
  it('omits a class with a syntax error and its dependants, writes once with the second plan', async () => {
    const out = join(root, 'out');
    let writes = 0;
    const { result, gateRuns } = await run(out, {
      writeFile: async (p, c) => {
        writes++;
        await mkdir(join(p, '..'), { recursive: true });
        await writeFile(p, c);
      },
    });
    expect(gateRuns).toBe(2);
    expect(result.omissions.map((o) => [o.className, o.reason.kind])).toEqual([
      ['Broken', 'syntax-error'],
      ['Child', 'extends-omitted'],
      ['NoSource', 'missing-source'],
      ['other.Importer', 'missing-source'],
    ]);
    expect(writes).toBe(result.files.length);
    const registry = await readFile(join(out, 'src', 'classes.ts'), 'utf8');
    expect(registryKeys(registry)).toEqual(['Hand', 'Loose', 'Thrower']);
    expect(result.files).toContain('src/Broken.ts'); // the omitted class file is still written
    expect(result.gate?.errors.some((e) => e.file === 'src/Broken.ts' && e.syntactic)).toBe(true);
  });

  it('omits a class of another package that imports an omitted class, from its import records', async () => {
    const out = join(root, 'out');
    const importer = tc(
      'other.Importer',
      "import { Broken } from './Broken';\nexport class Importer { b: Broken | null = null; }\n",
      null,
      ['Broken'],
    );
    const only = [classes[0], importer];
    const { result } = await run(out, { translated: only });
    expect(result.omissions.map((o) => [o.className, o.reason.kind])).toEqual([
      ['Broken', 'syntax-error'],
      ['Child', 'missing-source'],
      ['Hand', 'missing-source'],
      ['Loose', 'missing-source'],
      ['NoSource', 'missing-source'],
      ['Thrower', 'missing-source'],
      ['other.Importer', 'imports-omitted'],
    ]);
    expect(result.omissions.find((o) => o.className === 'other.Importer')?.reason).toMatchObject({ imported: 'Broken' });
  });

  it('keeps a class with only semantic errors registered and loose, with one gate run', async () => {
    const out = join(root, 'out');
    const only = classes.filter((c) => c.className === 'Loose' || c.className === 'Hand');
    const { result, gateRuns } = await run(out, { translated: only });
    expect(gateRuns).toBe(1);
    expect(real(result)).toEqual([]);
    expect(result.loose.map((l) => l.className)).toEqual(['Loose']);
    expect(registryKeys(await readFile(join(out, 'src', 'classes.ts'), 'utf8'))).toEqual(['Hand', 'Loose']);
  });

  it('does not omit a registered class for what it does when it runs', async () => {
    const out = join(root, 'out');
    const only = classes.filter((c) => c.className === 'Thrower');
    const { result } = await run(out, { translated: only });
    expect(real(result)).toEqual([]);
    expect(registryKeys(await readFile(join(out, 'src', 'classes.ts'), 'utf8'))).toContain('Thrower');
  });

  it('omits nothing for a GateError in src/main.ts', async () => {
    const out = join(root, 'out');
    const only = classes.filter((c) => c.className === 'Hand');
    const { result, gateRuns } = await run(out, { translated: only }, 'const n: number = "x";\nexport {};\n');
    expect(gateRuns).toBe(1);
    expect(result.gate?.errors.some((e) => e.file === 'src/main.ts')).toBe(true);
    expect(real(result)).toEqual([]);
  });

  it('never omits a handwritten class with errors', async () => {
    const out = join(root, 'out');
    const hw = join(root, 'hw');
    await mkdir(hw, { recursive: true });
    await writeFile(join(hw, 'Broken.ts'), 'export class Broken { x = ; }\n');
    const only = classes.filter((c) => c.className === 'Broken');
    const { result } = await run(out, { translated: only, handwrittenDir: hw });
    expect(real(result)).toEqual([]);
    expect(registryKeys(await readFile(join(out, 'src', 'classes.ts'), 'utf8'))).toContain('Broken');
  });

  it('decides only missing-source and its propagation without a gate', async () => {
    const out = join(root, 'out');
    const { result } = await run(out, { gate: undefined });
    expect(result.gate).toBeNull();
    expect(result.loose).toEqual([]);
    expect(result.omissions.every((o) => o.reason.kind === 'missing-source')).toBe(true);
    expect(result.omissions.map((o) => o.className)).toContain('NoSource');
  });
});

describe('emit: src/classes.ts of the samples is unchanged', () => {
  it.each(['clickgoto', 'tweendemo'] as const)('%s', async (sample) => {
    const fx = await emitFixtureProject(sample, (files) => typeCheckProject({ files, repoRoot: REPO_ROOT }));
    try {
      const names = Object.keys(fx.scene.symbols)
        .map((k) => fx.scene.symbols[k])
        .flatMap((s) => (s.type === 'sprite' && s.className !== undefined ? [s.className] : []));
      const text = await readFile(join(fx.projectDir, 'src', 'classes.ts'), 'utf8');
      expect(text).toBe(buildClassesTs(fx.scene, names));
      if (sample === 'clickgoto') {
        expect(text).toBe(
          [
            '// Generated by swf-resurrect. Maps linked class names to translated classes.',
            '// Symbols without an entry run as a plain MovieClip.',
            "import { LeftButton } from './LeftButton';",
            "import { MainTimeline } from './MainTimeline';",
            "import { RightButton } from './RightButton';",
            '',
            'export const classRegistry = {',
            '  "LeftButton": LeftButton,',
            '  "MainTimeline": MainTimeline,',
            '  "RightButton": RightButton,',
            '};',
            '',
          ].join('\n'),
        );
      }
    } finally {
      await fx.dispose();
    }
  }, 60000);
});
