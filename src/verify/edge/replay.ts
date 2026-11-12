// Replay (verify design section 6): runs replayRunner.ts in a child Node process over the Emitted_Project.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplayPlan } from '../core/replayPlan';
import { sanitizeDetail } from '../core/sanitize';
import type { ReplayRunnerResult } from './replayRunner';

export interface ReplayResult extends ReplayRunnerResult {}

export const REPLAY_TIMEOUT_MS = 60_000;

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const runnerPath = fileURLToPath(new URL('./replayRunner.ts', import.meta.url));

function failure(message: string): ReplayResult {
  return { lines: [], ticksRun: 0, error: { tick: 0, message: sanitizeDetail(message) } };
}

/** Never rejects: failures come back as `error`. */
export async function replay(
  projectDir: string,
  plan: ReplayPlan,
  timeoutMs: number = REPLAY_TIMEOUT_MS,
): Promise<ReplayResult> {
  const tempDir = await mkdtemp(resolve(tmpdir(), 'swf-replay-'));
  try {
    const planPath = resolve(tempDir, 'plan.json');
    const resultPath = resolve(tempDir, 'result.json');
    await writeFile(planPath, JSON.stringify(plan), 'utf8');

    const outcome = await new Promise<{ code: number | null; timedOut: boolean; stderr: string }>((done) => {
      const child = spawn(process.execPath, ['--import', 'tsx', runnerPath, resolve(projectDir), planPath, resultPath], {
        shell: false,
        cwd: repoRoot,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      let stderr = '';
      let timedOut = false;
      child.stderr.on('data', (d: Buffer) => {
        if (stderr.length < 4000) stderr += d.toString('utf8');
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      child.on('error', (e) => {
        clearTimeout(timer);
        done({ code: null, timedOut, stderr: e.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        done({ code, timedOut, stderr });
      });
    });

    if (outcome.timedOut) return failure(`timed out after ${Math.round(timeoutMs / 1000)} s`);
    try {
      return JSON.parse(await readFile(resultPath, 'utf8')) as ReplayResult;
    } catch {
      return failure(outcome.stderr.trim() === '' ? `runner exited with code ${String(outcome.code)}` : outcome.stderr);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
