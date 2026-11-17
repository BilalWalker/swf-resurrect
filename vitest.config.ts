import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, type Plugin } from "vitest/config";
// SWF_TEST_PHASE is set by scripts/runTests.ts: launchChromium.e2e runs alone, after the rest (task 29.1).
const ISOLATED = "test/e2e/launchChromium.e2e.test.ts";
const phase = process.env.SWF_TEST_PHASE;
const TEMPLATE_SHIM = fileURLToPath(new URL("./template/shim/index.ts", import.meta.url));

/**
 * Translated classes import '../shim' (the emitted src/ layout). Inside an Emitted_Project (a `shim/index.ts` next to the
 * importer's directory) that is the project's own Shim, so the classes and the project's Player share one Shim instance
 * (construction context, Stage, timers). Anywhere else (fixtures evaluated from test code) it is template/shim.
 */
export function shimResolve(source: string, importer: string | undefined): string | null {
  if (source !== "../shim") return null;
  if (importer !== undefined) {
    const own = join(dirname(dirname(importer.replace(/^file:\/\/\/?/, "").replace(/[?#].*$/, ""))), "shim", "index.ts");
    if (existsSync(own)) return own;
  }
  return TEMPLATE_SHIM;
}

const shimPlugin: Plugin = {
  name: "swf-resurrect-shim",
  enforce: "pre",
  resolveId(source, importer) {
    return shimResolve(source, importer);
  },
};

export default defineConfig({
  plugins: [shimPlugin],
  test: {
    include: phase === "isolated" ? [ISOLATED] : ["test/**/*.test.ts"],
    exclude: phase === "main" ? [...configDefaults.exclude, ISOLATED] : configDefaults.exclude,
    environment: "node",
  },
});
