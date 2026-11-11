import { PIXI_VERSION, TYPESCRIPT_VERSION, VITE_VERSION } from "./versions.js";

export const OUTPUT_PACKAGE_NAME = "swf-resurrect-output";

/**
 * Builds the emitted project's package.json text. Keys are inserted in sorted
 * order at every level, so output is deterministic. Ends with a newline.
 */
export function buildPackageJson(): string {
  const pkg = {
    devDependencies: {
      typescript: TYPESCRIPT_VERSION,
      vite: VITE_VERSION,
    },
    dependencies: {
      "pixi.js": PIXI_VERSION,
    },
    name: OUTPUT_PACKAGE_NAME,
    private: true,
    scripts: {
      build: "vite build",
      dev: "vite",
      typecheck: "tsc --noEmit",
    },
    type: "module",
    version: "0.0.0",
  };
  return sortKeys(pkg) + "\n";
}

function sortKeys(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      out[k] = sort((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(sort(value), null, 2);
}
