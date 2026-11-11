import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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
  }, 120_000);
});
