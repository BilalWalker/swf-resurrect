// Server options from argv and environment. Pure.
import { join } from 'node:path';
import { DEFAULT_RETENTION } from './retention';
import type { RetentionPolicy } from './retention';

export interface ServerOptions {
  port: number;
  host: string;
  dev: boolean;
  /** Per-job pipeline timeout. */
  timeoutMs: number;
  ffdecJar: string;
  /** When old job directories are deleted. */
  retention: RetentionPolicy;
  /** How often the retention sweep runs; 0: only at start. */
  sweepIntervalMs: number;
}

export type ParsedOptions = { ok: true; options: ServerOptions } | { ok: false; message: string };

export const DEFAULT_PORT = 5180;
export const DEFAULT_TIMEOUT_S = 180;
export const DEFAULT_SWEEP_MINUTES = 10;
export const USAGE =
  'Usage: web/server/main.ts [--dev] [--port <n>] [--host <addr>]  (env: see web/README.md)';

/** A whole number from the environment: the default when unset or empty, null when malformed. */
function envCount(env: Readonly<Record<string, string | undefined>>, name: string, fallback: number): number | null {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  return /^\d{1,9}$/.test(v) ? Number(v) : null;
}

function parsePort(s: string): number | null {
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 65535 ? n : null;
}

export function parseServerOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  repoRoot: string,
): ParsedOptions {
  let port: number | null = DEFAULT_PORT;
  let host = env.HOST !== undefined && env.HOST !== '' ? env.HOST : '127.0.0.1';
  let dev = false;
  if (env.PORT !== undefined && env.PORT !== '') {
    port = parsePort(env.PORT);
    if (port === null) return { ok: false, message: `PORT is not a port number: ${env.PORT}` };
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dev') dev = true;
    else if (a === '--port' || a === '--host') {
      const v = argv[i + 1];
      if (v === undefined || v === '') return { ok: false, message: `${a} needs a value\n${USAGE}` };
      i++;
      if (a === '--port') {
        port = parsePort(v);
        if (port === null) return { ok: false, message: `--port is not a port number: ${v}` };
      } else host = v;
    } else return { ok: false, message: `Unknown argument: ${a}\n${USAGE}` };
  }
  let timeoutS = DEFAULT_TIMEOUT_S;
  const t = env.SWF_RESURRECT_TIMEOUT_S;
  if (t !== undefined && t !== '') {
    if (!/^[1-9]\d{0,4}$/.test(t)) return { ok: false, message: `SWF_RESURRECT_TIMEOUT_S is not a positive number of seconds: ${t}` };
    timeoutS = Number(t);
  }
  const keepHours = envCount(env, 'SWF_RESURRECT_KEEP_HOURS', DEFAULT_RETENTION.maxAgeMs / 3600_000);
  const keepMb = envCount(env, 'SWF_RESURRECT_KEEP_MB', DEFAULT_RETENTION.maxTotalBytes / (1024 * 1024));
  const keepJobs = envCount(env, 'SWF_RESURRECT_KEEP_JOBS', DEFAULT_RETENTION.maxJobs);
  const sweepMin = envCount(env, 'SWF_RESURRECT_SWEEP_MINUTES', DEFAULT_SWEEP_MINUTES);
  for (const [name, v] of [
    ['SWF_RESURRECT_KEEP_HOURS', keepHours],
    ['SWF_RESURRECT_KEEP_MB', keepMb],
    ['SWF_RESURRECT_KEEP_JOBS', keepJobs],
    ['SWF_RESURRECT_SWEEP_MINUTES', sweepMin],
  ] as const) {
    if (v === null) return { ok: false, message: `${name} is not a whole number (0 means no limit): ${env[name]}` };
  }
  const jar = env.SWF_RESURRECT_FFDEC;
  return {
    ok: true,
    options: {
      port,
      host,
      dev,
      timeoutMs: timeoutS * 1000,
      ffdecJar: jar !== undefined && jar !== '' ? jar : join(repoRoot, 'tools', 'ffdec', 'ffdec-cli.jar'),
      retention: {
        maxAgeMs: (keepHours ?? 0) * 3600_000,
        maxTotalBytes: (keepMb ?? 0) * 1024 * 1024,
        maxJobs: keepJobs ?? 0,
        orphanGraceMs: DEFAULT_RETENTION.orphanGraceMs,
      },
      sweepIntervalMs: (sweepMin ?? 0) * 60_000,
    },
  };
}
