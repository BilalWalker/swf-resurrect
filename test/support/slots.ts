// A counting semaphore shared by every vitest worker process, for the e2e work that starts FFDec, Chromium or npm
// (task 29.1). A slot is a directory `.work/slots/<pool>/<n>` created atomically with mkdir and holding the owner's
// pid; a slot whose owner process is gone is taken over, so a killed run never blocks the next one.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SLOTS = resolve(repoRoot, '.work', 'slots');

/**
 * Pipeline runs (FFDec, emit, Vite build, Chromium) at the same time across all workers. At peak load in task 29.1
 * runs (16 JVMs, about 48 node and about 40 headless Chromium processes) Chromium launch, page loads and process exit
 * froze machine-wide for 2 to 5 minutes; the OS-level cause is unknown and 3 is a workaround (see the open item in
 * the task 29.1 notes of the breadth tasks.md).
 */
export const PIPELINE_SLOTS = 3;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function acquire(pool: string, size: number): Promise<string> {
  const dir = join(SLOTS, pool);
  await mkdir(dir, { recursive: true });
  for (;;) {
    for (let n = 0; n < size; n++) {
      const slot = join(dir, String(n));
      try {
        await mkdir(slot);
        await writeFile(join(slot, 'pid'), String(process.pid));
        return slot;
      } catch {
        // Taken. Reclaim it when its owner has exited (a pid file is written right after mkdir, so wait for it).
        const pidFile = join(slot, 'pid');
        if (existsSync(pidFile)) {
          const pid = Number(readFileSync(pidFile, 'utf8'));
          if (Number.isInteger(pid) && pid > 0 && !alive(pid)) await rm(slot, { recursive: true, force: true });
        }
      }
    }
    await sleep(200);
  }
}

/** Runs `fn` while holding one of `size` slots of `pool`. */
export async function withSlot<T>(pool: string, size: number, fn: () => Promise<T>): Promise<T> {
  const slot = await acquire(pool, size);
  try {
    return await fn();
  } finally {
    await rm(slot, { recursive: true, force: true });
  }
}
