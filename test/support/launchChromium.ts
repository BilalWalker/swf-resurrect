/**
 * Launches headless Chromium for an e2e test and ends it without waiting for its graceful exit.
 *
 * `browser.close()` waits until Chromium has shut down by itself. In a loaded full-suite run that took 3 to 10 s per
 * browser and more than 30 s in the worst case, which timed out the afterAll hooks (task 28.6). A browser from
 * `chromium.launch()` does not expose its process, so this launches a browser server and connects to it:
 * `BrowserServer.process()` (playwright-core/types/types.d.ts, interface BrowserServer) gives the ChildProcess, and
 * `stop()` kills that process and waits only for its exit event, then drops the connection. Chromium's own child
 * processes exit when the main process is gone. A killed browser cannot remove its own temporary files, so stop()\n * removes the artifacts directory (set through rtifactsDir) and the profile directory (the --user-data-dir\n * argument Playwright put on the command line).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';

export interface LaunchedChromium {
  readonly browser: Browser;
  /** Never throws. Safe to call twice. */
  stop(): Promise<void>;
}

export async function launchChromium(): Promise<LaunchedChromium> {
  const artifactsDir = await mkdtemp(join(tmpdir(), 'swf-chromium-'));
  const server = await chromium.launchServer({ headless: true, artifactsDir });
  const child = server.process();
  const profile = child.spawnargs.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  const cleanup = async (): Promise<void> => {
    const opts = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 };
    await rm(artifactsDir, opts).catch(() => undefined);
    if (profile !== undefined) await rm(profile, opts).catch(() => undefined);
  };
  let browser: Browser;
  try {
    browser = await chromium.connect(server.wsEndpoint());
  } catch (err) {
    child.kill('SIGKILL');
    await cleanup();
    throw err;
  }
  let stopped = false;
  return {
    browser,
    async stop() {
      if (stopped) return;
      stopped = true;
      const gone = child.exitCode !== null || child.signalCode !== null;
      const exited = gone ? Promise.resolve() : new Promise<void>((r) => child.once('exit', () => r()));
      child.kill('SIGKILL');
      await exited;
      await browser.close().catch(() => undefined);
      await cleanup();
    },
  };
}
