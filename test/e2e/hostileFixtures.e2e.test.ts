// Hostile_Fixture matrix (robustness task 12.2). Every file is generated here under a temporary directory and
// never committed. Each row asserts Outcome, reason code, exit code and the Outcome_Line as the last line; the Facts
// refusals also assert that no FFDec stage started. The table is printed and written to .work/hostile-matrix.md.
// Validates: Requirements 3.4, 3.5, 4.5, 4.12, 5.1, 5.2, 5.3, 5.9, 5.12, 5.13, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.7
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClassOmission } from '../../src/emit/classOmissions';
import { decideOutcome } from '../../src/outcome/outcome';
import type { OutcomeCode } from '../../src/outcome/outcome';
import { defaultLimits } from '../../src/pipeline/limits';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { FfdecExitError } from '../../src/unpack/errors';
import { createFakeClock } from '../support/fakeClock';
import { TAG, buildSwf, cut, flipByte, tag } from '../support/hostileSwf';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

let tmp: string;
let out: string;
let err: string;
let calls: string[];
const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };
const table: Array<{ row: string; outcome: string; reason: string; exit: number }> = [];

const tc = (className: string) => ({
  className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [],
});

interface Over {
  unpack?: () => Promise<never>;
  classes?: string[];
  omissions?: ClassOmission[];
}

function stages(over: Over = {}): PipelineStages {
  return {
    async unpack() {
      calls.push('unpack');
      if (over.unpack) return over.unpack();
      return {} as never;
    },
    async convert() {
      calls.push('convert');
      return {
        stagingDir: '', scenePath: '', shapePaths: [], imagePaths: [],
        scene: { formatVersion: 2, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 }, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]] } } },
        unsupported: [],
        stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0, placementsDropped: 0 },
      } as never;
    },
    async translate() {
      calls.push('translate');
      return { classes: (over.classes ?? []).map(tc), skippedScripts: [] };
    },
    async emit(_a, o) {
      calls.push('emit');
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: over.omissions ?? [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      return { errors: [] } as never;
    },
  };
}

function args(over: Partial<PipelineArgs> = {}): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp, ...over,
  };
}

const outcome = async () => JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));
const lastLine = () => out.trimEnd().split('\n').at(-1) ?? '';

/** Runs one row and checks the four common assertions. */
async function check(row: string, st: PipelineStages, expected: { outcome: OutcomeCode; reason: string | null; exit: number }, over: Partial<PipelineArgs> = {}) {
  const exit = await runPipeline(args(over), st, io);
  const o = await outcome();
  expect(exit).toBe(expected.exit);
  expect(o.outcome).toBe(expected.outcome);
  expect(o.reasonCode).toBe(expected.reason);
  expect(lastLine()).toMatch(new RegExp(`^Outcome: ${expected.outcome} ${expected.reason ?? '-'} `));
  table.push({ row, outcome: o.outcome, reason: o.reasonCode ?? '-', exit });
  return o;
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'hostile-'));
  out = '';
  err = '';
  calls = [];
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});
afterAll(async () => {
  const md = ['| Row | Outcome | Reason code | Exit |', '|---|---|---|---|', ...table.map((t) => `| ${t.row} | ${t.outcome} | ${t.reason} | ${t.exit} |`)].join('\n');
  console.log(`\nHostile_Fixture matrix\n${md}\n`);
  const file = join(repoRoot, '.work', 'hostile-matrix.md');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${md}\n`, 'utf8');
});

describe('Facts refusals start no FFDec process', () => {
  const rows: Array<[string, () => Uint8Array, string]> = [
    ['empty file', () => new Uint8Array(0), 'not-swf'],
    ['text file', () => new TextEncoder().encode('this is a plain text file, not a movie'), 'not-swf'],
    ['valid signature, no body', () => Uint8Array.from([0x46, 0x57, 0x53, 10, 8, 0, 0, 0]), 'damaged'],
    ['cut file', () => cut(buildSwf({ tags: [tag(TAG.FileAttributes, [8, 0, 0, 0])] }), 12), 'damaged'],
    ['damaged CWS stream', () => flipByte(buildSwf({ signature: 'CWS' }), 10), 'damaged'],
    ['AS1/AS2 file', () => buildSwf({ tags: [tag(TAG.DoAction, [0])] }), 'actionscript-1-2'],
  ];
  for (const [row, make, code] of rows) {
    it(`${row}: refused ${code}, exit 3`, async () => {
      await writeFile(join(tmp, 'a.swf'), make());
      await check(row, stages(), { outcome: 'refused', reason: code, exit: 3 });
      expect(calls).toEqual([]);
      expect(out).not.toContain('Done:');
    });
  }

  it('a file above a lowered size limit: refused too-large, exit 3', async () => {
    await writeFile(join(tmp, 'a.swf'), buildSwf({ tags: [tag(TAG.FileAttributes, [8, 0, 0, 0])] }));
    const limits = { ...defaultLimits(), maxSizeMiB: 1 };
    await writeFile(join(tmp, 'a.swf'), (() => {
      const b = new Uint8Array(1024 * 1024 + 1);
      b.set(buildSwf().subarray(0, 8));
      return b;
    })());
    await check('above lowered size limit', stages(), { outcome: 'refused', reason: 'too-large', exit: 3 }, { limits });
    expect(calls).toEqual([]);
  });
});

describe('encrypted (Open_Item O3)', () => {
  // No real encrypted file was measured and no FFDec signal for it is known, so no pipeline path produces
  // `encrypted`. This row only checks that a classified `encrypted` refusal decides refused, exit 3.
  it('decideOutcome maps a classified encrypted refusal to refused, exit 3; no pipeline path yields it yet', () => {
    const d = decideOutcome({
      facts: null, stages: [], failure: { kind: 'refused', reasonCode: 'encrypted', stage: 'unpack' },
      numbers: null, gaps: [], limits: defaultLimits(), recovery: null,
    });
    expect(d).toMatchObject({ outcome: 'refused', reasonCode: 'encrypted', exitCode: 3 });
    table.push({ row: 'encrypted (decideOutcome only, no pipeline signal)', outcome: d.outcome, reason: d.reasonCode ?? '-', exit: d.exitCode });
  });
});

describe('Failures at Unpack and the class counts', () => {
  beforeEach(async () => {
    await writeFile(join(tmp, 'a.swf'), buildSwf({ tags: [tag(TAG.FileAttributes, [8, 0, 0, 0])] }));
  });

  it('time-limit with the fake clock: refused time-limit, exit 3', async () => {
    const clock = createFakeClock();
    const st = stages({
      unpack: () => {
        setImmediate(() => clock.advance(180 * 1000));
        return new Promise<never>(() => undefined);
      },
    });
    const o = await check('time-limit (fake clock)', st, { outcome: 'refused', reason: 'time-limit', exit: 3 }, { clock });
    expect(o.reason).toContain('unpack');
  });

  it('an FFDec exit at Unpack: refused damaged, exit 3, FFDec text only in ffdec-<id>.log', async () => {
    const secret = 'SECRET_FFDEC_STDERR_TEXT';
    const st = stages({ unpack: async () => { throw new FfdecExitError(1, secret); } });
    const o = await check('FFDec exit at Unpack', st, { outcome: 'refused', reason: 'damaged', exit: 3 });
    const files = await readdir(join(tmp, 'out'));
    const log = files.find((f) => /^ffdec-[0-9a-f]{8}\.log$/.test(f));
    expect(log).toBeDefined();
    expect(await readFile(join(tmp, 'out', log!), 'utf8')).toContain(secret);
    expect(JSON.stringify(o)).not.toContain(secret);
    expect(out).not.toContain(secret);
    expect(err).not.toContain(secret);
  });

  it('our own TypeError at Unpack: failed, exit 1, never damaged', async () => {
    const st = stages({ unpack: async () => { throw new TypeError('x is undefined'); } });
    const o = await check('TypeError at Unpack', st, { outcome: 'failed', reason: 'internal-error', exit: 1 });
    expect(o.referenceId).toMatch(/^[0-9a-f]{8}$/);
    expect(err).toMatch(/internal error, reference [0-9a-f]{8}/);
  });

  it('timeline-only AS3 file with FileAttributes and no DoABC, 0 candidates: converted, exit 0, never refused', async () => {
    const o = await check('AS3 FileAttributes, no DoABC, 0 candidates', stages(), { outcome: 'converted', reason: null, exit: 0 });
    expect(o.numbers).toMatchObject({ candidateClasses: 0, translatedClasses: 0 });
    expect(out).toContain('Done:');
  });

  it('1 candidate class and 0 translated: refused nothing-translated, exit 3', async () => {
    const om: ClassOmission = { className: 'A', reason: { kind: 'missing-source' }, symbolIds: [1] };
    const o = await check('1 candidate, 0 translated', stages({ classes: ['A'], omissions: [om] }), { outcome: 'refused', reason: 'nothing-translated', exit: 3 });
    expect(o.numbers).toMatchObject({ candidateClasses: 1, translatedClasses: 0 });
    expect(out).not.toContain('Done:');
  });
});
