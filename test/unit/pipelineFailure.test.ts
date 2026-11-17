import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { FfdecExitError } from '../../src/unpack/errors';
import { buildSwf } from '../support/hostileSwf';

let tmp: string;
let out: string;
let err: string;
const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };

type Thrower = () => never;

function stages(at: 'unpack' | 'convert', thrower: Thrower): PipelineStages {
  return {
    async unpack() {
      if (at === 'unpack') thrower();
      return {} as never;
    },
    async convert() {
      thrower();
      return {} as never;
    },
    async translate() {
      return { classes: [], skippedScripts: [] };
    },
    async emit(_a, o) {
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      return { errors: [] } as never;
    },
  };
}

function args(): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
  };
}

const outDir = () => join(tmp, 'out');
const outcome = async () => JSON.parse(await readFile(join(outDir(), 'outcome.json'), 'utf8'));
const logs = async (prefix: string) => (await readdir(outDir())).filter((n) => n.startsWith(prefix) && n.endsWith('.log'));

async function run(at: 'unpack' | 'convert', thrower: Thrower): Promise<number> {
  await rm(outDir(), { recursive: true, force: true });
  out = '';
  err = '';
  return runPipeline(args(), stages(at, thrower), io);
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pipe-failure-'));
  await writeFile(join(tmp, 'a.swf'), buildSwf());
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('Failure_Log and Reference_Id (task 8.1)', () => {
  const boom = (): never => {
    throw new Error('boom');
  };

  it('gives the same Reference_Id for the same failure and another for another stage', async () => {
    expect(await run('convert', boom)).toBe(1);
    const first = (await outcome()).referenceId;
    await run('convert', boom);
    expect((await outcome()).referenceId).toBe(first);
    await run('unpack', boom);
    const other = (await outcome()).referenceId;
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(other).toMatch(/^[0-9a-f]{8}$/);
    expect(other).not.toBe(first);
  });

  it('writes the stack only to failure-<id>.log and carries the id in the line and the file', async () => {
    await run('convert', boom);
    const o = await outcome();
    expect(o.outcome).toBe('failed');
    expect(await logs('failure-')).toEqual([`failure-${o.referenceId}.log`]);
    const stack = await readFile(join(outDir(), `failure-${o.referenceId}.log`), 'utf8');
    expect(stack).toContain('Error: boom');
    expect(stack).toMatch(/\n\s+at /);
    expect(err).toContain(`error [pipeline]: internal error, reference ${o.referenceId}\n`);
    expect(err).not.toContain('boom');
    expect(out + err).not.toMatch(/\n\s+at /);
    expect(out.trimEnd().split('\n').pop()).toContain(`(reference ${o.referenceId})`);
    expect(JSON.stringify(o)).not.toMatch(/\bat \S+ \(/);
  });

  it('writes FFDec text only to ffdec-<id>.log for an FFDec exit at Unpack', async () => {
    const exit = await run('unpack', () => {
      throw new FfdecExitError(1, 'SECRETFFDEC trace java.lang.Foo');
    });
    expect(exit).toBe(3);
    const o = await outcome();
    expect(o).toMatchObject({ outcome: 'refused', reasonCode: 'damaged', referenceId: null });
    const [name] = await logs('ffdec-');
    expect(name).toMatch(/^ffdec-[0-9a-f]{8}\.log$/);
    expect(await readFile(join(outDir(), name!), 'utf8')).toContain('SECRETFFDEC');
    expect(await logs('failure-')).toEqual([]);
    const outcomeText = await readFile(join(outDir(), 'outcome.json'), 'utf8');
    for (const text of [outcomeText, out, err]) expect(text).not.toContain('SECRETFFDEC');
  });

  it('treats an own TypeError at Unpack as failed with a Failure_Log and no FFDec log', async () => {
    const exit = await run('unpack', () => {
      throw new TypeError('x is undefined');
    });
    expect(exit).toBe(1);
    const o = await outcome();
    expect(o).toMatchObject({ outcome: 'failed', reasonCode: 'internal-error' });
    expect(await logs('failure-')).toHaveLength(1);
    expect(await logs('ffdec-')).toEqual([]);
  });
});
