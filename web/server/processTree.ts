// Starts the pipeline CLI as a child process and kills it with all its descendants (FFDec's
// Java, Playwright's browser) on timeout or shutdown, on Windows and POSIX.
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface PipelineCommand {
  repoRoot: string;
  swfPath: string;
  outDir: string;
  workDir: string;
  ffdecJar: string;
}

/** node --import tsx src/pipeline/cli.ts ...: one Node process, no tsx wrapper process. */
export function pipelineArgs(c: PipelineCommand): string[] {
  return [
    '--import',
    'tsx',
    join(c.repoRoot, 'src', 'pipeline', 'cli.ts'),
    c.swfPath,
    c.outDir,
    '--force',
    '--verify',
    '--keep-work',
    '--work-dir',
    c.workDir,
    '--ffdec',
    c.ffdecJar,
  ];
}

export function spawnPipeline(c: PipelineCommand): ChildProcess {
  return spawn(process.execPath, pipelineArgs(c), {
    cwd: c.repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    // POSIX: own process group, so the whole group can be killed at once.
    detached: process.platform !== 'win32',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
}

/** Kills the process and every descendant. Safe to call more than once. */
export function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

/** True when `java -version` runs. */
export function javaAvailable(): boolean {
  try {
    const r = spawnSync('java', ['-version'], { windowsHide: true, stdio: 'ignore', timeout: 15_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
