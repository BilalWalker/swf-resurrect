// Spec task 2.2: the skip helper reports the skip.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPACER_SKIP_MESSAGE, describeIfSpacer, spacerSuiteTitle, spacerSwfPath } from "../support/fetchedSpacer";

describe("test/support/fetchedSpacer", () => {
  it("points at .work/samples/spacer/test.swf", () => {
    expect(spacerSwfPath().replace(/\\/g, "/")).toMatch(/\.work\/samples\/spacer\/test\.swf$/);
  });
  it("the skip message names the fetch command", () => {
    expect(SPACER_SKIP_MESSAGE).toContain("npm run fetch:spacer");
  });
  it("reports the skip in the suite title when the file is absent only", () => {
    const dir = mkdtempSync(join(tmpdir(), "sp-"));
    try {
      expect(spacerSuiteTitle("s", join(dir, "no.swf"))).toContain("npm run fetch:spacer");
      writeFileSync(join(dir, "test.swf"), "x");
      expect(spacerSuiteTitle("s", join(dir, "test.swf"))).toBe("s");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The skip itself, as collected for the real path: skipped when the file is absent.
describeIfSpacer("spacer fetched file (smoke)", () => {
  it("exists", () => {
    expect(spacerSwfPath()).toBeTruthy();
  });
});
