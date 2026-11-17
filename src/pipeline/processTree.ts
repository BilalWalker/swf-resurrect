/**
 * Kills a child process together with its descendants, and keeps a registry of children so a limit can end them all.
 *
 * Windows: `taskkill /PID <pid> /T /F`, no shell. POSIX: `process.kill(-pid, 'SIGKILL')` for a detached child (it
 * leads its own process group), else `child.kill('SIGKILL')`. A blocked synchronous stage cannot be interrupted from
 * inside the process (robustness Open_Item O1); this only ends children.
 */
import { spawn } from 'node:child_process';

/** The part of a ChildProcess this module uses. */
export interface KillableChild {
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface KillTreeOptions {
  /** True when the child was spawned with `detached: true` (POSIX: it leads a process group). */
  readonly detached?: boolean;
}

/** Kills `pid` and its descendants. Never throws. `child` is the fallback when the tree kill is not possible. */
export async function killTree(
  pid: number,
  child?: Pick<KillableChild, 'kill'>,
  options: KillTreeOptions = {},
): Promise<void> {
  const fallback = (): void => {
    try {
      child?.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  };
  if (!Number.isInteger(pid) || pid <= 0) {
    fallback();
    return;
  }
  if (process.platform === 'win32') {
    // No shell: the pid is passed as one argument and was checked to be an integer above.
    await new Promise<void>((resolve) => {
      const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      k.once('error', () => resolve());
      k.once('close', () => resolve());
    });
    fallback();
    return;
  }
  if (options.detached === true) {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      /* no such group */
    }
  }
  if (child !== undefined) fallback();
  else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

interface Tracked {
  readonly child: KillableChild;
  readonly detached: boolean;
}

const tracked = new Set<Tracked>();

function isLive(child: KillableChild): boolean {
  return child.pid !== undefined && child.exitCode === null && child.signalCode === null;
}

/** Registers a child. Returns a function that removes it again. */
export function track(child: KillableChild & { once?: (e: 'exit', l: () => void) => unknown }, options: KillTreeOptions = {}): () => void {
  const entry: Tracked = { child, detached: options.detached === true };
  tracked.add(entry);
  child.once?.('exit', () => tracked.delete(entry));
  return () => {
    tracked.delete(entry);
  };
}

/** Kills the tree of every tracked child that is still running, then empties the registry. Never throws. */
export async function killAll(): Promise<void> {
  const entries = [...tracked];
  tracked.clear();
  await Promise.all(
    entries
      .filter((e) => isLive(e.child))
      .map((e) => killTree(e.child.pid as number, e.child, { detached: e.detached })),
  );
}

/** Number of tracked children that are still live. For tests. */
export function liveCount(): number {
  let n = 0;
  for (const e of tracked) if (isLive(e.child)) n++;
  return n;
}
