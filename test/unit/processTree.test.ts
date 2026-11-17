import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { killAll, killTree, liveCount, track, type KillableChild } from '../../src/pipeline/processTree';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** A child that is already over; 999999 is a pid that no test ever signals because the child is not live. */
function deadChild(): KillableChild & { kill: ReturnType<typeof vi.fn> } {
  return { pid: 999999, exitCode: 0, signalCode: null, kill: vi.fn(() => true) };
}

describe('processTree registry', () => {
  it('counts only live children and untracks on request', () => {
    const dead = deadChild();
    const untrack = track(dead);
    expect(liveCount()).toBe(0);
    const live: KillableChild = { pid: 999998, exitCode: null, signalCode: null, kill: () => true };
    const untrackLive = track(live);
    expect(liveCount()).toBe(1);
    untrackLive();
    untrack();
    expect(liveCount()).toBe(0);
  });

  it('killAll kills a live child and never touches a finished one', async () => {
    const dead = deadChild();
    track(dead);
    const live = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
    track(live);
    const pid = live.pid as number;
    expect(alive(pid)).toBe(true);
    await killAll();
    expect(await gone(pid)).toBe(true);
    expect(dead.kill).not.toHaveBeenCalled();
    expect(liveCount()).toBe(0);
  });

  it('killTree never throws for an invalid or unknown pid', async () => {
    const child = { kill: vi.fn(() => true) };
    await expect(killTree(-1, child)).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    await expect(killTree(999997)).resolves.toBeUndefined();
  });
});
