// Cross-worker slots (task 29.1): at most `size` holders at once, a dead owner's slot is taken over, and the slot is
// freed when the work throws.
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { PIPELINE_SLOTS, withSlot } from '../support/slots';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const pool = `unit-${randomBytes(4).toString('hex')}`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('slots', () => {
  afterAll(async () => {
    await rm(resolve(repoRoot, '.work', 'slots', pool), { recursive: true, force: true });
  });

  it('caps Chromium-using pipeline runs at 3', () => {
    expect(PIPELINE_SLOTS).toBe(3);
  });

  it('never lets more than `size` tasks run at once', async () => {
    let running = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        withSlot(pool, 2, async () => {
          running++;
          peak = Math.max(peak, running);
          await sleep(30);
          running--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });

  it('frees the slot when the task throws', async () => {
    await expect(withSlot(pool, 1, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(withSlot(pool, 1, async () => 'ok')).resolves.toBe('ok');
  });

  it('takes over a slot whose owner process is gone', async () => {
    const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
    const deadPid = child.pid!;
    await new Promise((r) => child.once('close', r));
    const slot = resolve(repoRoot, '.work', 'slots', `${pool}-dead`, '0');
    await mkdir(slot, { recursive: true });
    await writeFile(join(slot, 'pid'), String(deadPid));
    await expect(withSlot(`${pool}-dead`, 1, async () => 'taken')).resolves.toBe('taken');
    await rm(resolve(repoRoot, '.work', 'slots', `${pool}-dead`), { recursive: true, force: true });
  });
});
