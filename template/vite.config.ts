import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// assets/ (scene.json, SVGs, ...) sits at the project root and is fetched at runtime as
// `assets/...`. Vite serves it as-is in dev, but `vite build` only bundles what index.html
// imports, so copy the folder into the output after the bundle is written.
function copyAssets(): Plugin {
  let root = '';
  let outDir = '';
  return {
    name: 'copy-assets',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const from = resolve(root, 'assets');
      if (existsSync(from)) cpSync(from, resolve(outDir, 'assets'), { recursive: true });
    },
  };
}

// Relative base so the built project works from any path or static host.
export default defineConfig({
  base: './',
  plugins: [copyAssets()],
});
