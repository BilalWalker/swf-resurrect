import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { PipelineError } from '../../src/pipeline/errors';

class FakeEmitRefusal extends PipelineError {
  readonly stage = 'emit' as const;
  readonly code = 'OUTPUT_DIR_NOT_EMPTY';
}
class FakeConvertFailure extends PipelineError {
  readonly stage = 'convert' as const;
  readonly code = 'X';
}

let tmp: string;
let swf: string;
let outDir: string;
let calls: string[];
let workDirs: string[];
let out: string;
let err: string;

const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };

function makeArtifact(): ConvertedArtifact {
  return {
    stagingDir: '',
    scenePath: '',
    svgPaths: [],
    scene: {
      formatVersion: 1,
      stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 },
      rootSymbolId: 0,
      symbols: {
        '0': { type: 'sprite', className: 'MainTimeline', frameCount: 1, frames: [[]] },
        '3': { type: 'sprite', className: 'LeftButton', frameCount: 1, frames: [[]] },
      },
    },
    unsupported: [{ kind: 'text', id: 9, message: 'text' }],
    stats: { svgWritten: 4, morphSkipped: 1, declaredShapes: 5 },
  } as unknown as ConvertedArtifact;
}

function makeStages(over: Partial<PipelineStages> = {}): PipelineStages {
  return {
    async unpack(i) {
      calls.push('unpack');
      workDirs.push(i.workDir);
      return {} as never;
    },
    async convert() {
      calls.push('convert');
      return makeArtifact();
    },
    async emit(_a, o) {
      calls.push('emit');
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [] };
    },
    ...over,
  };
}

function args(over: Partial<PipelineArgs> = {}): PipelineArgs {
  return {
    swfPath: swf,
    outputDir: outDir,
    force: false,
    keepWork: false,
    ffdecJarPath: 'jar',
    templateDir: 't',
    handwrittenDir: null,
    handwrittenClasses: ['LeftButton'],
    cwd: tmp,
    homeDir: tmp,
    ...over,
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pipe-test-'));
  swf = join(tmp, 'a.swf');
  await writeFile(swf, 'FWS');
  outDir = join(tmp, 'out');
  calls = [];
  workDirs = [];
  out = '';
  err = '';
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function exists(p: string): Promise<boolean> {
  return readdir(p).then(
    () => true,
    () => false,
  );
}

describe('runPipeline', () => {
  it('runs stages in order, prints progress and Done, exits 0', async () => {
    expect(await runPipeline(args(), makeStages(), io)).toBe(0);
    expect(calls).toEqual(['unpack', 'convert', 'emit']);
    expect(out).toBe(
      `[unpack] ok\n[convert] ok (4 svg written, 1 morph skipped)\n[emit] ok\nDone: ${outDir}\n`,
    );
  });

  it('writes unsupported-features.json with untranslated-class entries', async () => {
    await runPipeline(args(), makeStages(), io);
    const file = JSON.parse(await readFile(join(outDir, 'unsupported-features.json'), 'utf8'));
    expect(file.formatVersion).toBe(1);
    const kinds = file.entries.map((e: { kind: string; id?: number }) => `${e.kind}:${e.id}`);
    expect(kinds).toContain('text:9');
    expect(kinds).toContain('untranslated-class:0');
    expect(kinds).not.toContain('untranslated-class:3');
  });

  it('stops after a failing stage, names it, and exits 1', async () => {
    const stages = makeStages({
      async convert() {
        calls.push('convert');
        throw new FakeConvertFailure('boom');
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(calls).toEqual(['unpack', 'convert']);
    expect(err).toContain('error [convert]: boom');
    expect(out).not.toContain('Done:');
    expect(await exists(outDir)).toBe(false); // convert never completed: no list written
  });

  it('names the stage for plain errors from unpack', async () => {
    const stages = makeStages({
      async unpack() {
        throw new Error('no java');
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(err).toBe('error [unpack]: no java\n');
  });

  it('writes the list after an emit failure that is not a refusal', async () => {
    const stages = makeStages({
      async emit() {
        throw new Error('disk full');
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(err).toContain('error [emit]: disk full');
    const text = await readFile(join(outDir, 'unsupported-features.json'), 'utf8');
    expect(text).toContain('untranslated-class');
  });

  it('prints the list to stderr and leaves the directory alone on a refusal', async () => {
    await mkdir(outDir);
    await writeFile(join(outDir, 'keep.txt'), 'x');
    const stages = makeStages({
      async emit() {
        throw new FakeEmitRefusal('not empty');
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(await readdir(outDir)).toEqual(['keep.txt']);
    expect(err).toContain('error [emit]: not empty');
    expect(err).toContain('"untranslated-class"');
  });

  it('exits 2 without running a stage when the SWF is missing', async () => {
    expect(await runPipeline(args({ swfPath: join(tmp, 'nope.swf') }), makeStages(), io)).toBe(2);
    expect(calls).toEqual([]);
    expect(err).toContain('nope.swf');
  });

  it('exits 2 when the output path is a file', async () => {
    const file = join(tmp, 'file.txt');
    await writeFile(file, 'x');
    expect(await runPipeline(args({ outputDir: join(file, 'sub') }), makeStages(), io)).toBe(2);
    expect(calls).toEqual([]);
    expect(await exists(join(tmp, 'file.txt', 'sub')).catch(() => false)).toBe(false);
  });

  it('deletes its work directory by default, also after failure', async () => {
    await runPipeline(args(), makeStages(), io);
    expect(await exists(workDirs[0]!)).toBe(false);

    const failing = makeStages({
      async convert() {
        throw new Error('x');
      },
    });
    await runPipeline(args(), failing, io);
    expect(await exists(workDirs[1]!)).toBe(false);
  });

  it('keeps the work directory with keepWork', async () => {
    await runPipeline(args({ keepWork: true }), makeStages(), io);
    expect(await exists(workDirs[0]!)).toBe(true);
    await rm(workDirs[0]!, { recursive: true, force: true });
  });
});
