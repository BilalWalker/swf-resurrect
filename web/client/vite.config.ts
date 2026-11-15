// Vite config of the web client. Used by `npm run web` (middleware mode inside the web server)
// and `npm run web:build` (static files in web/dist, served by `npm run web:start`).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  publicDir: 'public',
  clearScreen: false,
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    // No inline data: URLs for assets; everything is a same-origin file (strict CSP in production).
    assetsInlineLimit: 0,
  },
});
