// Task 12.1 (robustness Requirements 6.6, 7.4): SIGINT and SIGBREAK end the run as `failed` with the reason
// `run stopped by signal`, exit 1, no child left, Outcome_Line last.
// Windows: Node cannot deliver SIGINT or SIGBREAK to a child process (process.kill and subprocess.kill end it
// unconditionally), so on Windows the handler is driven in-process through a fake signal target (the real runPipeline,
// real guard, real handlers, real child kill). On POSIX a real SIGINT is also sent to a spawned CLI-like entry.
// Validates: Requirements 6.6, 7.4
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { handledSignals } from '../../src/pipeline/signals';
import { runSleeping } from '../support/signalRun';
import { isAlive } from '../support/processTree';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SWF = join(REPO_ROOT, 'samples', 'clickgoto', 'test.swf');
const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'swf-signal-'));
  dirs.push(d);
  return d;
}

async function waitDead(pid: number): Promise<boolean> {
  for (let i = 0; i < 50; i++) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isAlive(pid);
}

async function checkOutcome(outDir: string): Promise<void> {
  const record = JSON.parse(await readFile(join(outDir, 'outcome.json'), 'utf8'));
  expect(record.outcome).toBe('failed');
  expect(record.reason).toBe('run stopped by signal');
  expect(record.referenceId).toBeNull();
}

describe('handled signals', () => {
  it('lists SIGBREAK only on Windows', () => {
    expect(handledSignals('win32')).toEqual(['SIGINT', 'SIGBREAK']);
    expect(handledSignals('linux')).toEqual(['SIGINT']);
  });
});

describe.each(handledSignals(process.platform))('%s delivered to the handler (in-process target)', (signal) => {
  it('exits 1 with a failed Outcome_File, kills the child and removes the listener', async () => {
    const dir = await tmp();
    const outDir = join(dir, 'out');
    const pidFile = join(dir, 'child.pid');
    const target = Object.assign(new EventEmitter(), { platform: process.platform });
    const lines: string[] = [];
    const code = await runSleeping({
      swfPath: SWF,
      outputDir: outDir,
      pidFile,
      target,
      io: { out: (s) => void lines.push(s), err: () => undefined },
      onReady: () => void setTimeout(() => target.emit(signal), 50),
    });
    expect(code).toBe(1);
    await checkOutcome(outDir);
    const last = (lines.filter((l) => l.trim() !== '').at(-1) ?? '').trim();
    expect(last).toBe('Outcome: failed internal-error run stopped by signal');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    expect(await waitDead(pid), 'the sleeping child is gone').toBe(true);
    expect(target.listenerCount(signal)).toBe(0);
  }, 30_000);
});

describe.skipIf(process.platform === 'win32')('real SIGINT to a spawned run (POSIX)', () => {
  it('exits 1, writes the Outcome_File and leaves no child', async () => {
    const dir = await tmp();
    const outDir = join(dir, 'out');
    const pidFile = join(dir, 'child.pid');
    const tsx = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const child = spawn(process.execPath, [tsx, 'test/support/signalRun.ts', SWF, outDir, pidFile], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    const ready = new Promise<void>((res) =>
      child.stdout.on('data', (b: Buffer) => {
        stdout += b.toString();
        if (stdout.includes('READY')) res();
      }),
    );
    const closed = new Promise<number | null>((res) => child.on('close', (c) => res(c)));
    await ready;
    child.kill('SIGINT');
    expect(await closed).toBe(1);
    await checkOutcome(outDir);
    expect(stdout.trim().split(/\r?\n/).at(-1)).toBe('Outcome: failed internal-error run stopped by signal');
    expect(existsSync(pidFile)).toBe(true);
    expect(await waitDead(Number(readFileSync(pidFile, 'utf8')))).toBe(true);
  }, 60_000);
});
