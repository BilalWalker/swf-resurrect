import { access, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FfdecTimeoutError } from '../unpack/errors';
import { spawnFfdec } from '../unpack/spawnFfdec';
import type { FfdecSpawner } from '../unpack/spawnFfdec';

/** Options of the two recovery calls (FFDec 26.4.0, `-help renameInvalidIdentifiers` and `-help deobfuscate`). */
export const RENAME_MODE = 'typeNumber';
export const DEOBFUSCATE_LEVEL = 'max';

export interface RecoverInput {
  /** The input SWF. Read only; it is copied and never written. */
  swfPath: string;
  /** The work directory; the chain lives in `<workDir>/recovery/`. */
  workDir: string;
  ffdecJarPath: string;
  javaCommand?: string;
  /** Per-call limit used only when no allowance is given (default 60 s). */
  timeoutMs?: number;
  /** Remaining `recover` stage allowance in ms; each FFDec call is bounded by what is left of it. */
  allowanceMs?: number;
  /** Names the allowance in a timeout error, for example `120 s stage limit`. */
  allowanceLabel?: string;
  /** Test seam: milliseconds clock for the remaining allowance. */
  now?: () => number;
  /** Test seam: replaces the real process spawner. */
  spawner?: FfdecSpawner;
}

export type RecoverStep = 'copy' | 'rename' | 'deobfuscate';

export interface RecoverResult {
  recoveryDir: string;
  /** `<recoveryDir>/in.swf`, a byte copy of the input. */
  copyPath: string;
  renamedPath: string;
  recoveredPath: string;
  /** True when `recoveredPath` exists after both steps. */
  ok: boolean;
  /** `copy-failed` when the copy could not be made; no FFDec call was made then. */
  skipped: 'copy-failed' | null;
  failedStep: RecoverStep | null;
  /** The error of the failed step (an FFDec exit, a timeout, a missing output or a copy error). */
  error: Error | null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recovery chain on a copy: rename invalid identifiers on `in.swf`, then deobfuscate the renamed file.
 * FFDec errors and timeouts are returned, not thrown. The input file is never written.
 */
export async function recover(input: RecoverInput): Promise<RecoverResult> {
  const swfPath = resolve(input.swfPath);
  const jarPath = resolve(input.ffdecJarPath);
  const javaCommand = input.javaCommand ?? 'java';
  const timeoutMs = input.timeoutMs ?? 60_000;
  const spawn = input.spawner ?? spawnFfdec;
  const now = input.now ?? Date.now;
  const startedAt = now();

  const recoveryDir = join(resolve(input.workDir), 'recovery');
  const copyPath = join(recoveryDir, 'in.swf');
  const renamedPath = join(recoveryDir, 'renamed.swf');
  const recoveredPath = join(recoveryDir, 'recovered.swf');
  const base = { recoveryDir, copyPath, renamedPath, recoveredPath };

  try {
    await mkdir(recoveryDir, { recursive: true });
    await copyFile(swfPath, copyPath);
  } catch (err) {
    return { ...base, ok: false, skipped: 'copy-failed', failedStep: 'copy', error: err as Error };
  }

  const call = async (step: RecoverStep, args: string[], output: string): Promise<Error | null> => {
    const bound = input.allowanceMs === undefined ? timeoutMs : Math.max(1, input.allowanceMs - (now() - startedAt));
    try {
      await spawn({ javaCommand, jarPath, args, timeoutMs: bound });
    } catch (err) {
      if (err instanceof FfdecTimeoutError && input.allowanceMs !== undefined && input.allowanceLabel !== undefined) err.limit = input.allowanceLabel;
      return err as Error;
    }
    if (!(await exists(output))) return new Error(`FFDec ${step} wrote no output file`);
    return null;
  };

  const renameError = await call('rename', ['-renameInvalidIdentifiers', RENAME_MODE, copyPath, renamedPath], renamedPath);
  if (renameError) return { ...base, ok: false, skipped: null, failedStep: 'rename', error: renameError };

  const deobError = await call('deobfuscate', ['-deobfuscate', DEOBFUSCATE_LEVEL, renamedPath, recoveredPath], recoveredPath);
  if (deobError) return { ...base, ok: false, skipped: null, failedStep: 'deobfuscate', error: deobError };

  return { ...base, ok: true, skipped: null, failedStep: null, error: null };
}
