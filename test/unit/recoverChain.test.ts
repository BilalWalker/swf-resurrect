import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recover } from '../../src/recover/recover';
import { FfdecExitError, FfdecTimeoutError } from '../../src/unpack/errors';
import type { FfdecSpawner, SpawnRequest } from '../../src/unpack/spawnFfdec';

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

let dir: string;
let swf: string;
let bytes: Buffer;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'recover-chain-'));
  swf = join(dir, 'input.swf');
  bytes = Buffer.from('FWS\x09fake swf bytes');
  await writeFile(swf, bytes);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Fake FFDec: records each call and writes the last argument as an output file. */
function fake(calls: SpawnRequest[], failOn?: string, error?: Error): FfdecSpawner {
  return async (req) => {
    calls.push(req);
    if (failOn !== undefined && req.args[0] === failOn) throw error ?? new FfdecExitError(1, 'boom');
    await writeFile(req.args[req.args.length - 1]!, `out of ${req.args[0]}`);
    return { stdout: '', stderr: '' };
  };
}

const base = () => ({ swfPath: swf, workDir: join(dir, 'work'), ffdecJarPath: join(dir, 'ffdec.jar') });

describe('recover chain', () => {
  it('renames the copy, then deobfuscates the renamed file, and leaves the input alone', async () => {
    const before = sha(bytes);
    const calls: SpawnRequest[] = [];
    const r = await recover({ ...base(), spawner: fake(calls) });
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.args)).toEqual([
      ['-renameInvalidIdentifiers', 'typeNumber', r.copyPath, r.renamedPath],
      ['-deobfuscate', 'max', r.renamedPath, r.recoveredPath],
    ]);
    expect(r.copyPath.endsWith(join('recovery', 'in.swf'))).toBe(true);
    expect(sha(await readFile(r.copyPath))).toBe(before);
    expect(sha(await readFile(swf))).toBe(before);
  });

  it('skips with copy-failed and makes no FFDec call when the copy cannot be made', async () => {
    const calls: SpawnRequest[] = [];
    const r = await recover({ ...base(), swfPath: join(dir, 'missing.swf'), spawner: fake(calls) });
    expect(r).toMatchObject({ ok: false, skipped: 'copy-failed', failedStep: 'copy' });
    expect(r.error).toBeInstanceOf(Error);
    expect(calls).toHaveLength(0);
  });

  it('returns a failed rename without calling deobfuscate', async () => {
    const calls: SpawnRequest[] = [];
    const r = await recover({ ...base(), spawner: fake(calls, '-renameInvalidIdentifiers') });
    expect(r).toMatchObject({ ok: false, skipped: null, failedStep: 'rename' });
    expect(r.error).toBeInstanceOf(FfdecExitError);
    expect(calls).toHaveLength(1);
  });

  it('returns a failed deobfuscate with the timeout error', async () => {
    const calls: SpawnRequest[] = [];
    const r = await recover({ ...base(), spawner: fake(calls, '-deobfuscate', new FfdecTimeoutError(1)) });
    expect(r).toMatchObject({ ok: false, failedStep: 'deobfuscate' });
    expect(r.error).toBeInstanceOf(FfdecTimeoutError);
  });

  it('bounds each call by the remaining allowance, and by 60 s without one', async () => {
    let t = 1000;
    const calls: SpawnRequest[] = [];
    const spawner: FfdecSpawner = async (req) => {
      calls.push(req);
      t += 30_000;
      await writeFile(req.args[req.args.length - 1]!, 'x');
      return { stdout: '', stderr: '' };
    };
    await recover({ ...base(), spawner, allowanceMs: 120_000, now: () => t });
    expect(calls.map((c) => c.timeoutMs)).toEqual([120_000, 90_000]);

    const plain: SpawnRequest[] = [];
    await recover({ ...base(), spawner: fake(plain) });
    expect(plain.map((c) => c.timeoutMs)).toEqual([60_000, 60_000]);
  });
});
