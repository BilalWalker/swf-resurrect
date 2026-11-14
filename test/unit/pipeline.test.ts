import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { PipelineError } from '../../src/pipeline/errors';
import { EmitWriteError, OutputDirNotEmptyError, UnsafeForceTargetError } from '../../src/emit/errors';
import { InvalidSwfError } from '../../src/unpack/errors';
import type { ClassOmission, LooseClass } from '../../src/emit/classOmissions';
import type { GateResult } from '../../src/translate/typeCheckGate';
import { gateError } from '../support/gateError';

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
    shapePaths: [], imagePaths: [],
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
    async translate() {
      calls.push('translate');
      return { classes: [], skippedScripts: [] };
    },
    async emit(_a, o) {
      calls.push('emit');
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      calls.push('typeCheck');
      return { errors: [] };
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
    expect(calls).toEqual(['unpack', 'convert', 'translate', 'emit', 'typeCheck']);
    expect(out).toBe(
      `[unpack] ok\n[convert] ok (4 svg written, 1 morph skipped)\n[translate] ok (0 classes: 0 clean, 0 loose, 0 unsupported)\n[emit] ok\n[typecheck] ok (0 errors)\nDone: ${outDir}\n`,
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
        throw new OutputDirNotEmptyError(outDir);
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(await readdir(outDir)).toEqual(['keep.txt']);
    expect(err).toContain('error [emit]:');
    expect(err).toContain('"untranslated-class"');
  });

  it('refuses a non-empty directory with the real error: list on stderr, nothing written', async () => {
    await mkdir(outDir);
    await writeFile(join(outDir, 'keep.txt'), 'x');
    const stages = makeStages({
      async emit() {
        throw new OutputDirNotEmptyError(outDir);
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(await readdir(outDir)).toEqual(['keep.txt']);
    expect(err).toContain('error [emit]:');
    expect(err).toContain('"text"');
  });

  it('refuses an unsafe --force target with the real error: list on stderr, nothing written', async () => {
    const stages = makeStages({
      async emit() {
        throw new UnsafeForceTargetError(outDir, 'home-directory');
      },
    });
    expect(await runPipeline(args({ force: true }), stages, io)).toBe(1);
    expect(await exists(outDir)).toBe(false);
    expect(err).toContain('home-directory');
    expect(err).toContain('"untranslated-class"');
  });

  it('writes the list after an EmitWriteError', async () => {
    const stages = makeStages({
      async emit() {
        throw new EmitWriteError(join(outDir, 'x'), new Error('EIO'));
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(err).toContain('error [emit]:');
    const text = await readFile(join(outDir, 'unsupported-features.json'), 'utf8');
    expect(text).toContain('"text"');
  });

  it('writes no list after an unpack failure', async () => {
    const stages = makeStages({
      async unpack() {
        calls.push('unpack');
        throw new InvalidSwfError(swf);
      },
    });
    expect(await runPipeline(args(), stages, io)).toBe(1);
    expect(calls).toEqual(['unpack']);
    expect(await exists(outDir)).toBe(false);
  });

  it('passes --force through to the emit stage', async () => {
    const seen: boolean[] = [];
    const stages = makeStages({
      async emit(_a, o) {
        seen.push(o.force);
        await mkdir(o.outputDir, { recursive: true });
        return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
      },
    });
    await runPipeline(args({ force: true }), stages, io);
    await runPipeline(args({ force: false }), stages, io);
    expect(seen).toEqual([true, false]);
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

describe('runPipeline: omitted classes (spec task 4.5)', () => {
  const broken: ClassOmission = {
    className: 'pkg.Broken',
    reason: { kind: 'syntax-error', count: 2, firstLine: 4, firstMessage: "';' expected." },
    symbolIds: [3, 5],
  };
  const noSource: ClassOmission = { className: 'MainTimeline', reason: { kind: 'missing-source' }, symbolIds: [0] };
  const looseA: LooseClass = { className: 'A', count: 1, firstLine: 2, firstMessage: 'x' };
  const gateWith = (file: string): GateResult => ({ errors: [gateError({ file, line: 2, code: 2322 })] });

  function translatedClass(className: string) {
    return { className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [] };
  }

  async function run(stages: PipelineStages): Promise<{
    unsupported: Array<{ kind: string; tag?: string; id?: number; message: string }>;
    report: any;
  }> {
    expect(await runPipeline(args(), stages, io)).toBe(0);
    const unsupported = JSON.parse(await readFile(join(outDir, 'unsupported-features.json'), 'utf8')).entries;
    const report = JSON.parse(await readFile(join(outDir, 'translation-report.json'), 'utf8'));
    return { unsupported, report };
  }

  it('writes one class-omitted entry per omitted class, never with a type-errors reason', async () => {
    const { unsupported } = await run(
      makeStages({
        async translate() {
          return { classes: [translatedClass('pkg.Broken')] } as never;
        },
        async emit(_a, o) {
          return { outputDir: o.outputDir, files: [], omissions: [broken], loose: [], classPaths: [], gate: { errors: [] } };
        },
      }),
    );
    const entries = unsupported.filter((e) => e.kind === 'class-omitted');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tag: 'pkg.Broken' });
    expect(entries[0]!.message).toContain('2 syntax errors, first at line 4');
    expect(entries[0]!.message).toContain('symbols 3, 5 become plain MovieClip');
    expect(entries.map((e) => e.message).join('\n')).not.toContain('type-errors');
  });

  it('keeps untranslated-class next to class-omitted for a linked class without a source', async () => {
    const { unsupported } = await run(
      makeStages({
        async emit(_a, o) {
          return { outputDir: o.outputDir, files: [], omissions: [noSource], loose: [], classPaths: [], gate: { errors: [] } };
        },
      }),
    );
    expect(unsupported.filter((e) => e.id === 0 && e.kind === 'untranslated-class')).toHaveLength(1);
    expect(unsupported.filter((e) => e.tag === 'MainTimeline' && e.kind === 'class-omitted')).toHaveLength(1);
  });

  it('reuses the gate result Emit returned and does not run the separate typeCheck stage', async () => {
    const result = gateWith('src/A.ts');
    const { report } = await run(
      makeStages({
        async translate() {
          return { classes: [translatedClass('A')] } as never;
        },
        async emit(_a, o) {
          return { outputDir: o.outputDir, files: [], omissions: [], loose: [looseA], classPaths: [], gate: result };
        },
      }),
    );
    expect(calls).not.toContain('typeCheck');
    expect(report.typeCheck).toBe('ran');
    expect(report.classes[0].typeErrors).toHaveLength(1);
    expect(report.classes[0].loose).toBe(true);
    expect(report.classes[0].omitted).toBe(false);
  });

  it('reports the gate of the written project, not the first one', async () => {
    // Emit's second run (after the omission) is the one it returns; the report must show that one.
    const written: GateResult = { errors: [] };
    const { report } = await run(
      makeStages({
        async translate() {
          return { classes: [translatedClass('pkg.Broken')] } as never;
        },
        async emit(_a, o) {
          return { outputDir: o.outputDir, files: [], omissions: [broken], loose: [], classPaths: [], gate: written };
        },
      }),
    );
    expect(report.otherErrors).toEqual([]);
    expect(report.omittedClasses.map((c: ClassOmission) => c.className)).toEqual(['pkg.Broken']);
    expect(report.classes[0].omitted).toBe(true);
    expect(report.classes[0].diagnostics.map((d: { kind: string; line: number }) => [d.kind, d.line])).toEqual([
      ['class-omitted', 4],
    ]);
  });

  it('passes classPaths from Emit into the report and maps type errors by the chosen path', async () => {
    const gate: GateResult = { errors: [gateError({ file: 'src/Main.class.ts', line: 2 })] };
    const { report } = await run(
      makeStages({
        async translate() {
          return { classes: [translatedClass('Main')] } as never;
        },
        async emit(_a, o) {
          const classPaths = [{ className: 'Main', originalPath: 'src/Main.ts', path: 'src/Main.class.ts' }];
          return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths, gate };
        },
      }),
    );
    expect(report.classPaths).toEqual([{ className: 'Main', originalPath: 'src/Main.ts', path: 'src/Main.class.ts' }]);
    expect(report.classes[0].typeErrors).toHaveLength(1);
    expect(report.otherErrors).toEqual([]);
  });
  it('injects the stage gate into Emit and falls back to typeCheck when Emit returns none', async () => {
    let injected = false;
    await run(
      makeStages({
        gate: () => ({ errors: [] }),
        async emit(_a, o) {
          injected = typeof o.gate === 'function';
          return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
        },
      }),
    );
    expect(injected).toBe(true);
    expect(calls).toContain('typeCheck');
  });
});