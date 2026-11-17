import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/pipeline/handwrittenSet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/pipeline/handwrittenSet')>();
  return {
    ...actual,
    readHandwrittenSet: vi.fn(async () => {
      throw new Error('EACCES: cannot read handwritten/SET.json');
    }),
  };
});

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/pipeline/cli';
import { PipelineError } from '../../src/pipeline/errors';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { buildSwf } from '../support/hostileSwf';

class RefusalError extends PipelineError {
  readonly stage = 'emit' as const;
  constructor(readonly code: string) {
    super(`refused with ${code}`);
  }
}

describe('pipeline: exit-2 cases and the unwritable directory (task 8.2)', () => {
  let tmp: string;
  let out: string;
  let err: string;
  const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };

  const artifact = {
    scene: { symbols: {} },
    unsupported: [],
    stats: { svgWritten: 0, morphSkipped: 0, placementsDropped: 0 },
  };

  function stages(over: Partial<PipelineStages>): PipelineStages {
    return {
      async unpack() {
        return {} as never;
      },
      async convert() {
        return artifact as never;
      },
      async translate() {
        return { classes: [], skippedScripts: [] };
      },
      async emit() {
        throw new Error('emit not expected');
      },
      async typeCheck() {
        return { errors: [] } as never;
      },
      ...over,
    };
  }

  const args = (): PipelineArgs => ({
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
  });

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'pipe-cli-'));
    await writeFile(join(tmp, 'a.swf'), buildSwf());
    out = '';
    err = '';
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it.each(['OUTPUT_DIR_NOT_EMPTY', 'UNSAFE_FORCE_TARGET'])(
    'returns 2 for %s with one error line, no Outcome_File and the directory untouched',
    async (code) => {
      await mkdir(join(tmp, 'out'));
      await writeFile(join(tmp, 'out', 'keep.txt'), 'x');
      const exit = await runPipeline(args(), stages({ emit: async () => { throw new RefusalError(code); } }), io);
      expect(exit).toBe(2);
      expect(await readdir(join(tmp, 'out'))).toEqual(['keep.txt']);
      const errorLines = err.split('\n').filter((l) => l.startsWith('error ['));
      expect(errorLines).toEqual([`error [pipeline]: refused with ${code}`]);
      expect(out).not.toContain('Outcome:');
      expect(out).not.toContain('Done:');
    },
  );

  it('keeps usage and path errors outside the Outcome set', async () => {
    const a = { ...args(), swfPath: join(tmp, 'missing.swf') };
    expect(await runPipeline(a, stages({}), io)).toBe(2);
    expect(err).toMatch(/^error \[pipeline\]: SWF file is missing/);
    expect(out).toBe('');
  });

  it('still prints the Outcome_Line last, with the Outcome exit code, when outcome.json cannot be written', async () => {
    const outDir = join(tmp, 'out');
    const exit = await runPipeline(
      args(),
      stages({
        async unpack() {
          await writeFile(outDir, 'a file where the directory should be');
          throw new TypeError('x is undefined');
        },
      }),
      io,
    );
    expect(exit).toBe(1);
    const lines = out.trimEnd().split('\n');
    expect(lines[lines.length - 1]).toMatch(/^Outcome: failed internal-error /);
    expect((await readdir(tmp)).filter((n) => n.startsWith('out'))).toEqual(['out']);
  });
});

describe('pipeline CLI: unreadable handwritten/SET.json (S2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the exception text on one error line and returns 2', async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stderr.write);
    const code = await main(['in.swf', 'out-dir']);
    const text = chunks.join('');
    expect(code).toBe(2);
    expect(text).toContain('EACCES: cannot read handwritten/SET.json');
    expect(text).not.toContain('${');
    expect(text).toBe('error [pipeline]: EACCES: cannot read handwritten/SET.json\n');
  });
});
