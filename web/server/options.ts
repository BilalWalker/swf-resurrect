// Server options from argv and environment. Pure.
import { join } from 'node:path';

export interface ServerOptions {
  port: number;
  host: string;
  dev: boolean;
  /** Per-job pipeline timeout. */
  timeoutMs: number;
  ffdecJar: string;
}

export type ParsedOptions = { ok: true; options: ServerOptions } | { ok: false; message: string };

export const DEFAULT_PORT = 5180;
export const DEFAULT_TIMEOUT_S = 180;
export const USAGE = 'Usage: web/server/main.ts [--dev] [--port <n>] [--host <addr>]  (env: PORT, HOST, SWF_RESURRECT_FFDEC, SWF_RESURRECT_TIMEOUT_S)';

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
  const jar = env.SWF_RESURRECT_FFDEC;
  return {
    ok: true,
    options: {
      port,
      host,
      dev,
      timeoutMs: timeoutS * 1000,
      ffdecJar: jar !== undefined && jar !== '' ? jar : join(repoRoot, 'tools', 'ffdec', 'ffdec-cli.jar'),
    },
  };
}
