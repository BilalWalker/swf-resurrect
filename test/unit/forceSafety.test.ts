import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import { emit } from '../../src/emit/emit';
import { OutputDirNotEmptyError, UnsafeForceTargetError } from '../../src/emit/errors';
import { checkForceTarget } from '../../src/emit/forceSafety';

const ctx = {
  cwd: resolve('/work/proj/run'),
  homeDir: resolve('/home/me'),
  swfPath: resolve('/data/games/a.swf'),
};

describe('checkForceTarget', () => {
  it('refuses a filesystem root', () => {
    expect(checkForceTarget(parse(resolve('/')).root, ctx)).toBe('filesystem-root');
  });
  it('refuses the home directory but not its subdirectories', () => {
    expect(checkForceTarget(ctx.homeDir, ctx)).toBe('home-directory');
    expect(checkForceTarget(join(ctx.homeDir, 'out'), ctx)).toBeNull();
  });
  it('refuses the cwd and its ancestors', () => {
    expect(checkForceTarget(ctx.cwd, ctx)).toBe('current-directory');
    expect(checkForceTarget(resolve('/work/proj'), ctx)).toBe('ancestor-of-current-directory');
  });
  it('refuses the SWF directory and its ancestors', () => {
    expect(checkForceTarget(resolve('/data/games'), ctx)).toBe('contains-input-swf');
    expect(checkForceTarget(resolve('/data'), ctx)).toBe('contains-input-swf');
  });
  it('allows unrelated paths, including siblings with a shared name prefix', () => {
    expect(checkForceTarget(resolve('/work/proj/run-out'), ctx)).toBeNull();
    expect(checkForceTarget(resolve('/data/games2'), ctx)).toBeNull();
    expect(checkForceTarget(join(ctx.cwd, 'out'), ctx)).toBeNull();
  });
  it('folds case on Windows only', () => {
    const upper = ctx.cwd.toUpperCase();
    expect(checkForceTarget(upper, ctx) !== null).toBe(process.platform === 'win32');
  });
});

describe('emit --force', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'force-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function setup(outputDir: string, force: boolean, extra: Partial<{ cwd: string; swfPath: string }> = {}) {
    const scene: SceneJson = {
      formatVersion: 2,
      stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 },
      rootSymbolId: 0,
      symbols: { '0': { type: 'sprite', frameCount: 1, labels: [], frames: [[]] } },
    };
    const staging = join(root, 'staging');
    await mkdir(staging, { recursive: true });
    const artifact: ConvertedArtifact = {
      stagingDir: staging,
      scenePath: join(staging, 'scene.json'),
      shapePaths: [], imagePaths: [],
      scene,
      unsupported: [],
      stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0 },
    };
    const templateDir = join(root, 'tpl');
    await mkdir(join(templateDir, 'src'), { recursive: true });
    await writeFile(join(templateDir, 'index.html'), '<html></html>\n');
    await writeFile(join(templateDir, 'src', 'classes.ts'), 'STATIC');
    const run = join(root, 'run');
    await mkdir(run, { recursive: true });
    return {
      artifact,
      options: {
        outputDir,
        force,
        swfPath: join(root, 'in', 'x.swf'),
        cwd: run,
        homeDir: join(root, 'home'),
        templateDir,
        handwrittenDir: null,
        ...extra,
      },
    };
  }

  it('without --force leaves a populated directory byte-identical', async () => {
    const out = join(root, 'out');
    await mkdir(join(out, 'sub'), { recursive: true });
    await writeFile(join(out, 'a.bin'), Buffer.from([0, 1, 2, 255]));
    await writeFile(join(out, 'sub', 'b.txt'), 'b');
    const { artifact, options } = await setup(out, false);
    await expect(emit(artifact, options)).rejects.toBeInstanceOf(OutputDirNotEmptyError);
    expect(await readdir(out)).toEqual(['a.bin', 'sub']);
    expect([...(await readFile(join(out, 'a.bin')))]).toEqual([0, 1, 2, 255]);
    expect(await readFile(join(out, 'sub', 'b.txt'), 'utf8')).toBe('b');
  });

  it('with --force empties the directory, keeps it, and writes the project', async () => {
    const out = join(root, 'out');
    await mkdir(join(out, 'sub'), { recursive: true });
    await writeFile(join(out, 'old.txt'), 'old');
    await writeFile(join(out, 'sub', 'old2.txt'), 'old');
    const before = await stat(out);
    const { artifact, options } = await setup(out, true);
    await emit(artifact, options);
    expect(await readdir(out)).toEqual(['assets', 'index.html', 'package.json', 'src']);
    expect((await stat(out)).ino).toBe(before.ino);
  });

  it('with --force removes a symlink inside the directory without touching its target', async () => {
    const out = join(root, 'out');
    const outside = join(root, 'outside');
    await mkdir(out, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'precious.txt'), 'keep');
    try {
      await symlink(outside, join(out, 'link'), 'junction');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        console.warn(`SKIPPED symlink assertion: platform denied link creation (${code}).`);
        return;
      }
      throw err;
    }
    const { artifact, options } = await setup(out, true);
    await emit(artifact, options);
    expect(await readdir(out)).not.toContain('link');
    expect(await readFile(join(outside, 'precious.txt'), 'utf8')).toBe('keep');
  });

  it('refuses unsafe targets before deleting anything', async () => {
    const cwdDir = join(root, 'run');
    await mkdir(cwdDir, { recursive: true });
    await writeFile(join(cwdDir, 'mine.txt'), 'mine');
    const cases: Array<[string, Partial<{ cwd: string; swfPath: string }>]> = [
      [cwdDir, {}],
      [root, {}],
      [join(root, 'in'), {}],
      [parse(root).root, {}],
    ];
    for (const [target, extra] of cases) {
      const { artifact, options } = await setup(target, true, extra);
      await mkdir(join(root, 'in'), { recursive: true });
      await writeFile(join(root, 'in', 'x.swf'), 'swf');
      await expect(emit(artifact, options)).rejects.toBeInstanceOf(UnsafeForceTargetError);
    }
    expect(await readFile(join(cwdDir, 'mine.txt'), 'utf8')).toBe('mine');
    expect(await readFile(join(root, 'in', 'x.swf'), 'utf8')).toBe('swf');
  });

  it('refuses the home directory', async () => {
    const home = join(root, 'home');
    await mkdir(home, { recursive: true });
    await writeFile(join(home, 'doc.txt'), 'doc');
    const { artifact, options } = await setup(home, true);
    await expect(emit(artifact, options)).rejects.toBeInstanceOf(UnsafeForceTargetError);
    expect(await readdir(home)).toEqual(['doc.txt']);
  });
});
