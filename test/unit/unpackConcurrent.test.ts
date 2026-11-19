import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { FfdecExitError, FfdecTimeoutError } from '../../src/unpack/errors';
import type { FfdecSpawner, SpawnRequest } from '../../src/unpack/spawnFfdec';
import { unpack } from '../../src/unpack/unpack';

// Feature: robustness, Requirement 27.9 (design D-E3): the dump and the export run at once.

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => childProcess);

const root = resolve(__dirname, '..', '..');
const tmpDirs: string[] = [];

afterAll(async () => {
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
});
afterEach(() => {
  vi.useRealTimers();
  childProcess.spawn.mockReset();
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'swf-unpack-conc-'));
  tmpDirs.push(dir);
  const swf = join(dir, 'in.swf');
  await writeFile(swf, 'FWS\x09rest');
  const jar = join(dir, 'ffdec-cli.jar');
  await writeFile(jar, 'jar');
  const workDir = join(dir, 'work');
  await mkdir(workDir);
  const xml = await readFile(join(root, 'test', 'fixtures', 'clickgoto', 'structure.xml'), 'utf8');
  return { swf, jar, workDir, xml };
}

const isDump = (req: SpawnRequest): boolean => req.args[0] === '-swf2xml';

async function writeExports(workDir: string): Promise<void> {
  await mkdir(join(workDir, 'shapes'), { recursive: true });
  await mkdir(join(workDir, 'scripts'), { recursive: true });
}

/** Rejects with the abort reason when the request's signal aborts. */
function untilAborted(req: SpawnRequest): Promise<never> {
  return new Promise((_resolve, reject) => {
    req.signal?.addEventListener('abort', () => reject(req.signal?.reason ?? new Error('aborted')), { once: true });
  });
}

describe('unpack runs the dump and the export at once (fake FFDec)', () => {
  it('starts both calls before either ends', async () => {
    const s = await setup();
    const started: string[] = [];
    const ended: string[] = [];
    let release!: () => void;
    const bothStarted = new Promise<void>((r) => (release = r));
    const spawner: FfdecSpawner = async (req) => {
      const name = isDump(req) ? 'dump' : 'export';
      started.push(name);
      if (started.length === 2) release();
      await bothStarted; // neither call can end until both have started
      if (isDump(req)) await writeFile(req.args[2]!, s.xml);
      else await writeExports(s.workDir);
      ended.push(name);
      return { stdout: '', stderr: '' };
    };
    await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner });
    expect(started).toEqual(['dump', 'export']);
    expect(ended).toHaveLength(2);
  });

  it('gives both calls the whole stage allowance, so the stage as a whole stays inside it', async () => {
    const s = await setup();
    const seen: number[] = [];
    const spawner: FfdecSpawner = async (req) => {
      seen.push(req.timeoutMs);
      if (isDump(req)) await writeFile(req.args[2]!, s.xml);
      else await writeExports(s.workDir);
      return { stdout: '', stderr: '' };
    };
    let t = 1_000;
    await unpack({
      swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner,
      allowanceMs: 120_000, allowanceLabel: '120 s stage limit', now: () => t,
    });
    expect(seen).toEqual([120_000, 120_000]);
  });

  it('a failed dump aborts the export and its error is the one thrown', async () => {
    const s = await setup();
    let exportReq: SpawnRequest | undefined;
    const spawner: FfdecSpawner = async (req) => {
      if (isDump(req)) throw new FfdecExitError(1, 'bad dump');
      exportReq = req;
      return untilAborted(req);
    };
    const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FfdecExitError);
    expect(exportReq?.signal?.aborted).toBe(true);
  });

  it('a timeout of the export names the stage limit and is thrown after the dump is read', async () => {
    const s = await setup();
    const spawner: FfdecSpawner = async (req) => {
      if (isDump(req)) {
        await new Promise((r) => setTimeout(r, 5));
        await writeFile(req.args[2]!, s.xml);
        return { stdout: '', stderr: '' };
      }
      throw new FfdecTimeoutError(120);
    };
    const err = await unpack({
      swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner,
      allowanceMs: 120_000, allowanceLabel: '120 s stage limit',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FfdecTimeoutError);
    expect((err as FfdecTimeoutError).limit).toBe('120 s stage limit');
  });

  it('a timeout of the dump aborts the export', async () => {
    const s = await setup();
    let exportReq: SpawnRequest | undefined;
    const spawner: FfdecSpawner = async (req) => {
      if (isDump(req)) throw new FfdecTimeoutError(120);
      exportReq = req;
      return untilAborted(req);
    };
    const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FfdecTimeoutError);
    expect(exportReq?.signal?.aborted).toBe(true);
  });
});

describe('real spawner with a fake child process: abort', () => {
  function fakeChild() {
    const child = Object.assign(new EventEmitter(), {
      stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
      stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
      kill: vi.fn(),
    });
    childProcess.spawn.mockReturnValue(child);
    return child;
  }

  it('an abort kills the child and rejects with the reason; a later close changes nothing', async () => {
    const { spawnFfdec } = await import('../../src/unpack/spawnFfdec');
    const child = fakeChild();
    const ctl = new AbortController();
    const p = spawnFfdec({ javaCommand: 'java', jarPath: 'x.jar', args: ['-header', 'a.swf'], timeoutMs: 60_000, signal: ctl.signal });
    const reason = new Error('stop');
    ctl.abort(reason);
    await expect(p).rejects.toBe(reason);
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.emit('close', 1);
  });

  it('a signal that is already aborted kills the child at once', async () => {
    const { spawnFfdec } = await import('../../src/unpack/spawnFfdec');
    const child = fakeChild();
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      spawnFfdec({ javaCommand: 'java', jarPath: 'x.jar', args: [], timeoutMs: 60_000, signal: ctl.signal }),
    ).rejects.toBeDefined();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});
