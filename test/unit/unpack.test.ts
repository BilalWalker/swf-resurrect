import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FfdecTimeoutError, MissingExportError } from '../../src/unpack/errors';
import type { FfdecSpawner } from '../../src/unpack/spawnFfdec';
import { unpack } from '../../src/unpack/unpack';

const root = resolve(__dirname, '..', '..');
const workDirs: string[] = [];

afterAll(async () => {
  for (const d of workDirs) await rm(d, { recursive: true, force: true });
});

describe('unpack (real FFDec)', () => {
  it('unpacks samples/clickgoto/test.swf and reports header values', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'swf-unpack-'));
    workDirs.push(workDir);
    const result = await unpack({
      swfPath: join(root, 'samples', 'clickgoto', 'test.swf'),
      workDir,
      ffdecJarPath: join(root, 'tools', 'ffdec', 'ffdec-cli.jar'),
    });
    expect(result.header).toEqual({ widthPx: 550, heightPx: 400, frameRate: 24, frameCount: 3 });
    expect(result.xmlVersion.major).toBe(4);
    expect(result.shapesDir).toBe(join(workDir, 'shapes'));
    expect(result.textsDir).toBe(join(workDir, 'texts'));
  }, 120_000);
});

describe('unpack text export (fake FFDec)', () => {
  async function run(withTexts: boolean, dumpHasText: boolean) {
    const dir = await mkdtemp(join(tmpdir(), 'swf-unpack-txt-'));
    workDirs.push(dir);
    const swf = join(dir, 'in.swf');
    await writeFile(swf, 'FWS\x09rest');
    const jar = join(dir, 'ffdec-cli.jar');
    await writeFile(jar, 'jar');
    const workDir = join(dir, 'work');
    await mkdir(workDir);
    let xml = await readFile(join(root, 'test', 'fixtures', 'clickgoto', 'structure.xml'), 'utf8');
    if (dumpHasText) xml = xml.replace('<item type="DefineShape4Tag"', '<item type="DefineTextTag" characterID="9"/><item type="DefineShape4Tag"');
    const calls: string[][] = [];
    const spawner: FfdecSpawner = async (req) => {
      calls.push(req.args);
      if (req.args[0] === '-swf2xml') {
        await writeFile(req.args[2]!, xml);
      } else {
        await mkdir(join(workDir, 'shapes'), { recursive: true });
        await mkdir(join(workDir, 'scripts'), { recursive: true });
        if (withTexts) await mkdir(join(workDir, 'texts'), { recursive: true });
      }
      return { stdout: '', stderr: '' };
    };
    const result = await unpack({ swfPath: swf, workDir, ffdecJarPath: jar, spawner }).catch((e) => e);
    return { result, calls, workDir };
  }

  it('12.1 the export call carries -format text:svg and the text export', async () => {
    const { result, calls, workDir } = await run(true, true);
    expect(calls[1]).toEqual(['-format', 'text:svg', '-export', 'shape,script,text', workDir, expect.any(String)]);
    expect(result.textsDir).toBe(join(workDir, 'texts'));
  });

  it('12.1 a missing texts directory is an error only when the dump has text', async () => {
    expect((await run(false, true)).result).toBeInstanceOf(MissingExportError);
    expect((await run(false, false)).result.textsDir).toBeDefined();
  });
});

describe('unpack per-call bound from the stage allowance (fake FFDec)', () => {
  async function setup() {
    const dir = await mkdtemp(join(tmpdir(), 'swf-unpack-allow-'));
    workDirs.push(dir);
    const swf = join(dir, 'in.swf');
    await writeFile(swf, 'FWS\x09rest');
    const jar = join(dir, 'ffdec-cli.jar');
    await writeFile(jar, 'jar');
    return { dir, swf, jar };
  }
  it('passes the stage allowance to both calls at once, not a fixed 60 s, and names the limit on timeout', async () => {
    const { dir, swf, jar } = await setup();
    const xml = await readFile(join(root, 'test', 'fixtures', 'clickgoto', 'structure.xml'), 'utf8');
    let t = 0;
    const seen: number[] = [];
    const spawner: FfdecSpawner = async (req) => {
      seen.push(req.timeoutMs);
      await Promise.resolve(); // both calls have started before any time passes
      t += 70_000; // longer than 60 s: must not be cut
      if (seen.length === 2) throw new FfdecTimeoutError(Math.round(req.timeoutMs / 1000));
      await writeFile(req.args[2]!, xml);
      return { stdout: '', stderr: '' };
    };
    const err = await unpack({
      swfPath: swf, workDir: dir, ffdecJarPath: jar, spawner,
      allowanceMs: 120_000, allowanceLabel: '120 s stage limit', now: () => t,
    }).catch((e: unknown) => e);
    expect(seen[0]).toBe(120_000);
    expect(seen).toEqual([120_000, 120_000]);
    expect((err as FfdecTimeoutError).limit).toBe('120 s stage limit');
  });
  it('keeps the fixed 60 s default without an allowance', async () => {
    const { dir, swf, jar } = await setup();
    const seen: number[] = [];
    const spawner: FfdecSpawner = async (req) => {
      seen.push(req.timeoutMs);
      throw new Error('stop');
    };
    await unpack({ swfPath: swf, workDir: dir, ffdecJarPath: jar, spawner }).catch(() => undefined);
    expect(seen).toEqual([60_000, 60_000]);
  });
});
