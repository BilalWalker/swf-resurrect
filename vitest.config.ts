import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
// SWF_TEST_PHASE is set by scripts/runTests.ts: launchChromium.e2e runs alone, after the rest (task 29.1).
const ISOLATED = "test/e2e/launchChromium.e2e.test.ts";
const phase = process.env.SWF_TEST_PHASE;

export default defineConfig({
  resolve: {
    // Translated classes import '../shim' (the emitted src/ layout); map it to template/shim.
    alias: [{ find: /^\.\.\/shim$/, replacement: fileURLToPath(new URL("./template/shim/index.ts", import.meta.url)) }],
  },
  test: {
    include: phase === "isolated" ? [ISOLATED] : ["test/**/*.test.ts"],
    exclude: phase === "main" ? [...configDefaults.exclude, ISOLATED] : configDefaults.exclude,
    environment: "node",
  },
});
