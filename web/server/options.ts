// Server options from argv and environment. Pure.
import { join } from 'node:path';
import type { RateLimit } from './rateLimit';
import { DEFAULT_RETENTION } from './retention';
import type { RetentionPolicy } from './retention';

export interface ServerOptions {
  port: number;
  host: string;
  dev: boolean;
  /**
   * Per-job run limit. Passed to the pipeline as `--run-limit`, so the engine stops itself and
   * reports `refused time-limit`; the server kills the process only BACKSTOP_MARGIN_S later.
   */
  timeoutMs: number;
  ffdecJar: string;
  /** When old job directories are deleted. */
  retention: RetentionPolicy;
  /** How often the retention sweep runs; 0: only at start. */
  sweepIntervalMs: number;
  /** NODE_ENV=production: public-host defaults (rate limit on). */
  production: boolean;
  /** Per-client limit on starting conversions; null: no limit. */
  rateLimit: RateLimit | null;
  /** Reverse proxies in front of the server whose X-Forwarded-For entries are trusted (TRUST_PROXY). */
  trustProxyHops: number;
  /** SWF_RESURRECT_UPLOADS=off: gallery only, uploads are refused with 403. */
  uploadsEnabled: boolean;
  /**
   * SWF_RESURRECT_FRAME_ANCESTORS: other origins allowed to show the app in a frame (a host's page
   * that embeds it, such as a Hugging Face Space page). Empty: only the app's own origin.
   */
  frameAncestors: string[];
}

export type ParsedOptions = { ok: true; options: ServerOptions } | { ok: false; message: string };

export const DEFAULT_PORT = 5180;
/**
 * Equal to the engine's default run limit (src/pipeline/limits.ts), so the CLI and the web app
 * give the same verdict on the same file. A 9 MB game takes about 130 s without Verify on the
 * development machine; Verify adds to that, and the old 180 s left too little room.
 */
export const DEFAULT_TIMEOUT_S = 300;
/**
 * Seconds the server waits past the run limit before it kills the process tree itself. The engine
 * checks its limit with a timer that a long synchronous stage can delay, then stops FFDec and the
 * browser and writes outcome.json; 30 s covers that and Node's start-up before the run clock starts.
 */
export const BACKSTOP_MARGIN_S = 30;

/** When the server kills a job that the engine did not stop at its own run limit. */
export function backstopMs(runLimitMs: number): number {
  return runLimitMs + BACKSTOP_MARGIN_S * 1000;
}
export const DEFAULT_SWEEP_MINUTES = 10;
export const DEFAULT_RATE_LIMIT: RateLimit = { burst: 3, perHour: 10 };
export const USAGE =
  'Usage: web/server/main.ts [--dev] [--port <n>] [--host <addr>]  (env: see web/README.md)';

/** A whole number from the environment: the default when unset or empty, null when malformed. */
function envCount(env: Readonly<Record<string, string | undefined>>, name: string, fallback: number): number | null {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  return /^\d{1,9}$/.test(v) ? Number(v) : null;
}

/** https://host or https://host:port, nothing more: no path, query, fragment, user or wildcard. */
const FRAME_ORIGIN = /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*(:\d{1,5})?$/;

/** A space-separated list of origins: none when unset or empty; the first bad one otherwise. */
function parseFrameAncestors(v: string | undefined): { ok: true; origins: string[] } | { ok: false; bad: string } {
  const origins = (v ?? '').split(/\s+/).filter((o) => o !== '');
  const bad = origins.find((o) => !FRAME_ORIGIN.test(o));
  return bad === undefined ? { ok: true, origins } : { ok: false, bad };
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
  const production = env.NODE_ENV === 'production';
  const rl = env.SWF_RESURRECT_RATE_LIMIT;
  if (rl !== undefined && rl !== '' && rl !== 'on' && rl !== 'off') {
    return { ok: false, message: `SWF_RESURRECT_RATE_LIMIT must be on or off: ${rl}` };
  }
  const rateOn = rl === 'on' || ((rl === undefined || rl === '') && production);
  const burst = envCount(env, 'SWF_RESURRECT_RATE_BURST', DEFAULT_RATE_LIMIT.burst);
  const perHour = envCount(env, 'SWF_RESURRECT_RATE_PER_HOUR', DEFAULT_RATE_LIMIT.perHour);
  if (burst === null || burst < 1) {
    return { ok: false, message: `SWF_RESURRECT_RATE_BURST must be a whole number of at least 1: ${env.SWF_RESURRECT_RATE_BURST}` };
  }
  if (perHour === null) return { ok: false, message: `SWF_RESURRECT_RATE_PER_HOUR is not a whole number: ${env.SWF_RESURRECT_RATE_PER_HOUR}` };
  const tp = env.TRUST_PROXY;
  if (tp !== undefined && tp !== '' && !/^\d{1,2}$/.test(tp)) {
    return { ok: false, message: `TRUST_PROXY must be the number of trusted reverse proxies (0 to 99): ${tp}` };
  }
  const up = env.SWF_RESURRECT_UPLOADS;
  if (up !== undefined && up !== '' && up !== 'on' && up !== 'off') {
    return { ok: false, message: `SWF_RESURRECT_UPLOADS must be on or off: ${up}` };
  }
  const fa = parseFrameAncestors(env.SWF_RESURRECT_FRAME_ANCESTORS);
  if (!fa.ok) {
    return {
      ok: false,
      message: `SWF_RESURRECT_FRAME_ANCESTORS must be origins like https://example.org, separated by spaces (no path, query or wildcard): ${fa.bad}`,
    };
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
      production,
      rateLimit: rateOn ? { burst, perHour } : null,
      trustProxyHops: tp === undefined || tp === '' ? 0 : Number(tp),
      uploadsEnabled: up !== 'off',
      frameAncestors: fa.origins,
    },
  };
}
