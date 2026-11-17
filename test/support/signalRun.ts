// Test entry for task 12.1: runs the real runPipeline and the real signal handlers on a stage fake that sleeps.
// The unpack fake starts one tracked child process (a sleeping node) and writes its pid to a file, then waits.
// Used in-process by test/e2e/signal.e2e.test.ts, and as a script (`tsx test/support/signalRun.ts <swf> <outDir> <pidFile>`)
// where the test sends a real SIGINT (POSIX only: Node cannot deliver SIGINT to a child on Windows).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultLimits } from '../../src/pipeline/limits';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineStages } from '../../src/pipeline/pipeline';
import { track } from '../../src/pipeline/processTree';
import { installSignalHandlers } from '../../src/pipeline/signals';
import type { SignalTarget } from '../../src/pipeline/signals';

export interface SleepingRun {
  swfPath: string;
  outputDir: string;
  pidFile: string;
  target: SignalTarget;
  io: { out(s: string): void; err(s: string): void };
  /** Called once the child has started and its pid is written. */
  onReady?: () => void;
}

export async function runSleeping(run: SleepingRun): Promise<number> {
  const stages = {
    async unpack() {
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true });
      track(child);
      writeFileSync(run.pidFile, String(child.pid));
      run.onReady?.();
      await new Promise<never>(() => undefined);
      throw new Error('unreachable');
    },
  } as unknown as PipelineStages;
  const handlers = installSignalHandlers(run.target);
  try {
    return await runPipeline(
      {
        swfPath: run.swfPath,
        outputDir: run.outputDir,
        force: false,
        keepWork: false,
        ffdecJarPath: 'unused',
        templateDir: 'unused',
        handwrittenDir: null,
        handwrittenClasses: [],
        cwd: process.cwd(),
        homeDir: process.cwd(),
        limits: defaultLimits(),
        onGuard: handlers.onGuard,
      },
      stages,
      run.io,
    );
  } finally {
    handlers.dispose();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [swfPath, outputDir, pidFile] = process.argv.slice(2) as [string, string, string];
  runSleeping({
    swfPath,
    outputDir,
    pidFile,
    target: process,
    io: { out: (s) => void process.stdout.write(s), err: (s) => void process.stderr.write(s) },
    onReady: () => void process.stdout.write('READY\n'),
  }).then(
    (code) => process.stdout.write('', () => process.exit(code)),
    () => process.exit(1),
  );
}
