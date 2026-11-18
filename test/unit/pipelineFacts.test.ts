import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClassOmission } from '../../src/emit/classOmissions';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { gateError } from '../support/gateError';
import { TAG, buildSwf, cut, tag } from '../support/hostileSwf';

let tmp: string;
let out: string;
let err: string;
let calls: string[];
const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };

const tc = (className: string) => ({
  className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [],
});

interface Over {
  scriptsDir?: string;
  placementsDropped?: number;
  gateErrors?: ReturnType<typeof gateError>[];
  omissions?: ClassOmission[];
}

function stages(over: Over = {}): PipelineStages {
  return {
    async unpack() {
      calls.push('unpack');
      return (over.scriptsDir === undefined ? {} : { scriptsDir: over.scriptsDir }) as never;
    },
    async convert() {
      calls.push('convert');
      return {
        stagingDir: '', scenePath: '', shapePaths: [], imagePaths: [],
        scene: { formatVersion: 2, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 }, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]] } } },
        unsupported: [],
        stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0, placementsDropped: over.placementsDropped ?? 0 },
      } as never;
    },
    async translate() {
      calls.push('translate');
      return { classes: [tc('A'), tc('B')], skippedScripts: [] };
    },
    async emit(_a, o) {
      calls.push('emit');
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: over.omissions ?? [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      return { errors: over.gateErrors ?? [] } as never;
    },
  };
}

function args(): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
  };
}

const outcome = async () => JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pipe-facts-'));
  await writeFile(join(tmp, 'a.swf'), buildSwf());
  out = '';
  err = '';
  calls = [];
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('Facts stage (task 7.2)', () => {
  const refusals: Array<[string, () => Uint8Array, string]> = [
    ['not-swf', () => new TextEncoder().encode('hello, not a movie'), 'not-swf'],
    ['damaged', () => cut(buildSwf({ signature: 'CWS' }), 20), 'damaged'],
    ['actionscript-1-2', () => buildSwf({ tags: [tag(TAG.DoAction, [0])] }), 'actionscript-1-2'],
    ['too-large', () => {
      const b = new Uint8Array(21 * 1024 * 1024);
      b.set(buildSwf().subarray(0, 8));
      return b;
    }, 'too-large'],
  ];
  for (const [name, make, code] of refusals) {
    it(`${name}: refused with no FFDec stage started`, async () => {
      await writeFile(join(tmp, 'a.swf'), make());
      const exit = await runPipeline(args(), stages(), io);
      expect(calls).toEqual([]);
      expect(exit).toBe(3);
      const o = await outcome();
      expect(o).toMatchObject({ outcome: 'refused', reasonCode: code });
      expect(out).not.toContain('Done:');
      expect(out.trimEnd().split('\n').at(-1)).toMatch(new RegExp(`^Outcome: refused ${code} `));
    });
  }

  it('puts the header facts into the Outcome', async () => {
    await runPipeline(args(), stages(), io);
    const o = await outcome();
    expect(o.facts).toMatchObject({ signature: 'FWS', stage: { width: 550, height: 400 }, scriptVersion: 'unknown' });
  });
});

describe('Dropped placements (Checkpoint 1)', () => {
  it('shows one dropped placement in numbers, gaps and the reason', async () => {
    await runPipeline(args(), stages({ placementsDropped: 1 }), io);
    const o = await outcome();
    expect(o.outcome).toBe('converted-with-gaps');
    expect(o.numbers.droppedPlacements).toBe(1);
    expect(o.gaps).toMatchObject([{ kind: 'dropped-placement', count: 1 }]);
    expect(o.gaps).toHaveLength(1);
    expect(o.reason).toContain('dropped-placement');
  });
});
describe('Outcome numbers (task 7.2)', () => {
  it('come from the report after the gate, not from the [translate] line', async () => {
    await runPipeline(args(), stages({ gateErrors: [gateError({ file: 'src/A.ts' })] }), io);
    expect(out).toContain('[translate] ok (2 classes: 2 clean, 0 loose, 0 unsupported)');
    const report = JSON.parse(await readFile(join(tmp, 'out', 'translation-report.json'), 'utf8'));
    const o = await outcome();
    expect(report.classes.map((c: { status: string }) => c.status).sort()).toEqual(['clean', 'unsupported']);
    expect(o.numbers).toMatchObject({
      candidateClasses: 2, translatedClasses: 2, cleanClasses: 1, looseClasses: 0, untranslatedCodeClasses: 1, unsupportedClasses: 1, typeErrors: 1,
    });
    expect(o.outcome).toBe('converted-with-gaps');
  });

  it('droppedPlacements equals stats.placementsDropped', async () => {
    await runPipeline(args(), stages({ placementsDropped: 4 }), io);
    const o = await outcome();
    expect(o.numbers.droppedPlacements).toBe(4);
    expect(o.outcome).toBe('converted-with-gaps');
  });

  it('a project where every candidate is omitted is refused nothing-translated', async () => {
    const om = (className: string): ClassOmission => ({ className, reason: { kind: 'missing-source' }, symbolIds: [1] });
    const exit = await runPipeline(args(), stages({ omissions: [om('A'), om('B')] }), io);
    const o = await outcome();
    expect(o.numbers).toMatchObject({ candidateClasses: 2, translatedClasses: 0, omittedClasses: 2 });
    expect(o).toMatchObject({ outcome: 'refused', reasonCode: 'nothing-translated' });
    expect(exit).toBe(3);
  });
});

describe('abcClassCount (task 7.2)', () => {
  it('equals the number of .as files FFDec exported, including packages', async () => {
    const scripts = join(tmp, 'scripts');
    await mkdir(join(scripts, 'pkg', 'sub'), { recursive: true });
    for (const f of ['A.as', 'B.as', 'pkg/C.as', 'pkg/sub/D.as']) await writeFile(join(scripts, f), '');
    await writeFile(join(scripts, 'notes.txt'), '');
    await runPipeline(args(), stages({ scriptsDir: scripts }), io);
    const o = await outcome();
    expect(o.facts.abcClassCount).toBe(4);
    expect(o.facts.source.ffdec).toEqual(['abcClassCount']);
  });
});
