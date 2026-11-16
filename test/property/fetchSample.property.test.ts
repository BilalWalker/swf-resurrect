// Spec task 2.1, Property 25: A wrong hash writes nothing.
// **Validates: Requirements 28.4**
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type FetchDeps, SPACER_SOURCE, fetchSample, sha256Hex } from "../../src/samples/fetchedSample";

function recorder(bytes: Uint8Array, viaLocal: boolean) {
  const writes: string[] = [];
  const deps: FetchDeps = {
    fetchBytes: async () => bytes,
    readLocal: async () => bytes,
    writeFile: async (p) => void writes.push(`write ${p}`),
    rename: async (a, b) => void writes.push(`rename ${a} ${b}`),
    removeFile: async () => {},
    readFileIfPresent: async () => null,
    mkdirp: async () => {},
    out: () => {},
    err: () => {},
  };
  return { deps, writes, options: viaLocal ? { localPath: "x.swf" } : {} };
}

describe("Property 25: a wrong hash writes nothing", () => {
  it("bytes with another SHA-256 give the mismatch outcome and no write; matching bytes are written once", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 64 }), fc.boolean(), async (bytes, viaLocal) => {
        const source = { ...SPACER_SOURCE, sha256: await sha256Hex(new Uint8Array([...bytes, 1])) };
        const bad = recorder(bytes, viaLocal);
        expect(await fetchSample(bad.deps, source, bad.options)).toBe("sha-mismatch");
        expect(bad.writes).toEqual([]);

        const good = recorder(bytes, viaLocal);
        const ok = { ...SPACER_SOURCE, sha256: await sha256Hex(bytes) };
        expect(await fetchSample(good.deps, ok, good.options)).toBe("fetched");
        expect(good.writes).toHaveLength(2);
        expect(good.writes.filter((w) => w.startsWith("rename"))).toHaveLength(1);
      }),
      { numRuns: 50 },
    );
  });
});
