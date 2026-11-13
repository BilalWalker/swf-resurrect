import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractShimMembers, renderShimMembersTs } from "../../src/translate/shimMembers";

describe("shimMembers.generated.ts", () => {
  it("matches template/shim/ (run `npm run gen:shim-members` when this fails)", () => {
    const files = readdirSync("template/shim")
      .filter((f) => f.endsWith(".ts"))
      .sort()
      .map((path) => ({ path, text: readFileSync(`template/shim/${path}`, "utf8") }));
    const expected = renderShimMembersTs(extractShimMembers(files));
    const committed = readFileSync("src/translate/shimMembers.generated.ts", "utf8").replace(/\r\n/g, "\n");
    if (committed !== expected) {
      throw new Error("src/translate/shimMembers.generated.ts is out of date with template/shim/. Run `npm run gen:shim-members` and commit the result.");
    }
    expect(committed).toBe(expected);
  });
});
