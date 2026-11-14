// Entry point: `npm run web` (dev, Vite middleware) or `npm run web:start` (built client).
import { cp } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, staticClient } from './http';
import { JobManager } from './jobs';
import { parseServerOptions } from './options';
import type { ServerOptions } from './options';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface RunningServer {
  url: string;
  port: number;
  jobs: JobManager;
  close(): Promise<void>;
}

/** Builds the emitted project with the repo's own Vite and PixiJS and copies dist to appDir. */
async function buildPreview(projectDir: string, appDir: string): Promise<void> {
  const { buildProject } = await import('../../src/verify/edge/buildProject');
  const built = await buildProject(projectDir);
  try {
    await cp(built.distDir, appDir, { recursive: true });
  } finally {
    await built.dispose();
  }
}

export async function startServer(
  options: ServerOptions,
  paths: { repoRoot?: string; runsDir?: string } = {},
): Promise<RunningServer> {
  const repoRoot = paths.repoRoot ?? REPO_ROOT;
  const jobs = new JobManager({
    repoRoot,
    runsDir: paths.runsDir ?? join(repoRoot, '.work', 'web-runs'),
    ffdecJar: options.ffdecJar,
    timeoutMs: options.timeoutMs,
    buildPreview,
  });
  await jobs.load();

  const server = createServer();
  let closeVite: (() => Promise<void>) | null = null;
  let next;
  if (options.dev) {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({
      configFile: join(repoRoot, 'web', 'client', 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    closeVite = () => vite.close();
    next = vite.middlewares;
  } else {
    next = staticClient(join(repoRoot, 'web', 'dist'));
  }
  server.on('request', createHandler({ jobs, repoRoot }, next));

  await new Promise<void>((res, rej) => {
    server.once('error', rej);
    server.listen(options.port, options.host, () => res());
  });
  const port = (server.address() as AddressInfo).port;
  const shownHost = options.host.includes(':') ? `[${options.host}]` : options.host;
  return {
    url: `http://${shownHost}:${port}`,
    port,
    jobs,
    async close() {
      await jobs.stop();
      server.closeAllConnections();
      await new Promise<void>((res) => server.close(() => res()));
      if (closeVite !== null) await closeVite();
    },
  };
}

const invokedAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const parsed = parseServerOptions(process.argv.slice(2), process.env, REPO_ROOT);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    process.exit(2);
  }
  startServer(parsed.options).then(
    (s) => {
      const setup = s.jobs.setupStatus();
      process.stdout.write(`SWF Resurrect web app (${parsed.options.dev ? 'dev' : 'production'}): ${s.url}\n`);
      for (const p of setup.problems) process.stdout.write(`setup: ${p}\n`);
      let closing = false;
      const shutdown = (): void => {
        if (closing) return;
        closing = true;
        process.stdout.write('Stopping...\n');
        void s.close().finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    },
    (err: unknown) => {
      process.stderr.write(`Cannot start the web server: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
