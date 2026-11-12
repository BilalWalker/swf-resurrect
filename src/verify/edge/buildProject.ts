// Builds an Emitted_Project with the repo's own Vite and PixiJS in a staging copy under .work/
// (verify design, section 5 and D3). No npm install, no network.
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export interface BuiltProject {
  /** Absolute path of the staging `dist` directory. */
  distDir: string;
  /** Removes the staging directory (idempotent). */
  dispose(): Promise<void>;
}

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export async function buildProject(projectDir: string): Promise<BuiltProject> {
  const parent = resolve(repoRoot, '.work');
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(resolve(parent, 'verify-'));
  const dispose = async (): Promise<void> => {
    await rm(staging, { recursive: true, force: true });
  };
  try {
    await cp(resolve(projectDir), staging, {
      recursive: true,
      filter: (src) => {
        const name = basename(src);
        return name !== 'node_modules' && name !== 'dist';
      },
    });
    const distDir = resolve(staging, 'dist');
    await build({
      root: staging,
      configFile: false,
      base: './',
      logLevel: 'silent',
      build: { outDir: distDir, emptyOutDir: true },
    });
    // The emitted project keeps assets/ at its root (not in public/), so `vite build` does not
    // copy it, while the loader fetches `assets/...` relative to index.html. Copy it into dist.
    await cp(resolve(staging, 'assets'), resolve(distDir, 'assets'), { recursive: true });
    return { distDir, dispose };
  } catch (err) {
    await dispose();
    throw err;
  }
}
