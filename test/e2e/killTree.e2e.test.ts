// Requirements 6.14, 6.15, 25.5: spawnFfdec's own timeout path ends the whole process tree, not just the first child.
// The "jar" is a node script: spawnFfdec runs `<javaCommand> -jar <jar> ...`, and node has no -jar option, so the spawn
// the module sees is rewritten here from the fake command name to `node <script> ...`. The process is real, the
// timeout path is spawnFfdec's own.
import { spawn as realSpawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const spawnedPids: number[] = [];

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const spawn = ((command: string, args: readonly string[], options: object) => {
    if (command !== 'fake-java') return (actual.spawn as (...a: unknown[]) => unknown)(command, args, options);
    const child = actual.spawn(process.execPath, args.slice(1), options as never);
    if (child.pid !== undefined) spawnedPids.push(child.pid);
    return child;
  }) as typeof actual.spawn;
  return { ...actual, spawn };
});

const { spawnFfdec } = await import('../../src/unpack/spawnFfdec');
const { FfdecTimeoutError } = await import('../../src/unpack/errors');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cond();
}

const dir = mkdtempSync(join(tmpdir(), 'swf-killtree-'));
afterAll(() => {
  for (const pid of spawnedPids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

const script = `
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
writeFileSync(process.argv[2], String(grandchild.pid));
setTimeout(() => {}, 60000);
`;

describe(`spawnFfdec timeout kills the process tree (${process.platform === 'win32' ? 'Windows: taskkill /T' : 'POSIX: signal'})`, () => {
  it('leaves neither the child nor its grandchild running', async () => {
    const jar = join(dir, 'fake.js');
    const pidFile = join(dir, 'grandchild.pid');
    writeFileSync(jar, script);

    const run = spawnFfdec({ javaCommand: 'fake-java', jarPath: jar, args: [pidFile], timeoutMs: 3000 });
    await expect(run).rejects.toBeInstanceOf(FfdecTimeoutError);

    expect(existsSync(pidFile), 'the grandchild was started before the timeout').toBe(true);
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    const child = spawnedPids[0] as number;
    expect(Number.isInteger(grandchild) && grandchild > 0).toBe(true);

    expect(await waitFor(() => !alive(child), 10000), 'child gone').toBe(true);
    expect(await waitFor(() => !alive(grandchild), 10000), 'grandchild gone').toBe(true);
  });
});
