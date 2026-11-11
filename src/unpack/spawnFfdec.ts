import { spawn } from 'node:child_process';
import { stripAnsi } from './ansi';
import { FfdecExitError, FfdecTimeoutError, JavaNotFoundError } from './errors';

export interface SpawnRequest {
  javaCommand: string;
  jarPath: string;
  args: string[];
  timeoutMs: number;
}

export interface SpawnOutput {
  stdout: string;
  stderr: string;
}

/** Runs one FFDec invocation. Injectable so error paths can be tested without Java. */
export type FfdecSpawner = (req: SpawnRequest) => Promise<SpawnOutput>;

/**
 * Spawns `java -jar <jar> ...args` without a shell. Output is ANSI-stripped.
 * @throws JavaNotFoundError on ENOENT, FfdecTimeoutError after timeoutMs (child is killed),
 *         FfdecExitError on a non-zero exit code.
 */
export const spawnFfdec: FfdecSpawner = (req) =>
  new Promise<SpawnOutput>((resolve, reject) => {
    const child = spawn(req.javaCommand, ['-jar', req.jarPath, ...req.args], { shell: false });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish(() => reject(new FfdecTimeoutError(Math.round(req.timeoutMs / 1000))));
    }, req.timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr?.on('data', (d: string) => {
      stderr += d;
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish(() => reject(err.code === 'ENOENT' ? new JavaNotFoundError() : err));
    });

    child.on('close', (code) => {
      if (timedOut) return;
      finish(() => {
        const out = { stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) };
        if (code !== 0) reject(new FfdecExitError(code ?? -1, out.stderr));
        else resolve(out);
      });
    });
  });
