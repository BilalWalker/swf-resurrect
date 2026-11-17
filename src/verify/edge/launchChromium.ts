/**
 * Launches headless Chromium and ends it in two steps: a graceful close with a short bounded wait, then a kill of
 * the whole process tree.
 *
 * `browser.close()` waits until Chromium has shut down by itself. In a loaded full-suite run that took 3 to 10 s per
 * browser and more than 30 s in the worst case, which timed out the afterAll hooks (task 28.6) and, in
 * `renderFrames`, can hold a pipeline run (task 29.1). A browser from `chromium.launch()` does not expose its
 * process, so this launches a browser server and connects to it: `BrowserServer.process()`
 * (playwright-core/types/types.d.ts, interface BrowserServer) gives the ChildProcess. `stop()` first closes the
 * connection and the server and waits at most GRACEFUL_CLOSE_MS, then kills the process and every descendant
 * (`taskkill /PID <pid> /T /F` on Windows, the process group elsewhere) and waits only for the exit event of the main
 * process. A killed browser cannot remove its own temporary files, so stop() removes the artifacts directory (set
 * through `artifactsDir`) and the profile directory (the --user-data-dir argument Playwright put on the command
 * line). Callers must have read everything they need from the browser before calling stop().
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { killTree, track } from '../../pipeline/processTree';

/** How long stop() waits for a graceful close. A healthy Chromium closes in well under a second; 3 s is enough for that and short next to the 30 s a loaded one has taken. */
export const GRACEFUL_CLOSE_MS = 3_000;

export interface LaunchedChromium {
  readonly browser: Browser;
  /** The pid of the Chromium main process. */
  readonly pid: number;
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
  const untrack = track(child, { detached: true });
  let browser: Browser;
  try {
    browser = await chromium.connect(server.wsEndpoint());
  } catch (err) {
    untrack();
    child.kill('SIGKILL');
    await cleanup();
    throw err;
  }
  let stopped = false;
  const pid = child.pid ?? -1;
  const hasExited = (): boolean => child.exitCode !== null || child.signalCode !== null;
  return {
    browser,
    pid,
    async stop() {
      if (stopped) return;
      stopped = true;
      const exited = hasExited() ? Promise.resolve() : new Promise<void>((r) => child.once('exit', () => r()));
      // Step 1: ask politely, but only for GRACEFUL_CLOSE_MS.
      let timer: NodeJS.Timeout | undefined;
      const bound = new Promise<void>((r) => (timer = setTimeout(r, GRACEFUL_CLOSE_MS)));
      const graceful = (async () => {
        await browser.close().catch(() => undefined);
        await server.close().catch(() => undefined);
        await exited;
      })();
      await Promise.race([graceful, bound]);
      clearTimeout(timer);
      // Step 2: whatever is still running goes, with its descendants.
      if (!hasExited()) {
        await killTree(pid, child, { detached: true }); // Playwright starts Chromium detached.
        await exited;
      }
      await cleanup();
    },
  };
}
