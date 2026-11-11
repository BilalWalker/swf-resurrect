import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    // Translated classes import '../shim' (the emitted src/ layout); map it to template/shim.
    alias: [{ find: /^\.\.\/shim$/, replacement: fileURLToPath(new URL("./template/shim/index.ts", import.meta.url)) }],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
