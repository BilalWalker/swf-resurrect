import { describe, expect, it } from "vitest";
import { buildPackageJson } from "../../src/emit/packageJson.js";
import { PIXI_VERSION, TYPESCRIPT_VERSION, VITE_VERSION } from "../../src/emit/versions.js";

describe("versions", () => {
  it.each([
    ["pixi.js", PIXI_VERSION],
    ["vite", VITE_VERSION],
    ["typescript", TYPESCRIPT_VERSION],
  ])("%s is an exact version", (_name, v) => {
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("buildPackageJson", () => {
  const text = buildPackageJson();
  const pkg = JSON.parse(text);

  it("has the expected name, scripts and exact dependencies", () => {
    expect(pkg.name).toBe("swf-resurrect-output");
    expect(Object.keys(pkg.scripts)).toEqual(["build", "dev", "typecheck"]);
    expect(pkg.dependencies).toEqual({ "pixi.js": PIXI_VERSION });
    expect(pkg.devDependencies).toEqual({ typescript: TYPESCRIPT_VERSION, vite: VITE_VERSION });
  });

  it("has sorted keys at every level and is deterministic", () => {
    const sorted = (o: object) => Object.keys(o).join() === Object.keys(o).sort().join();
    expect(sorted(pkg)).toBe(true);
    expect(sorted(pkg.scripts)).toBe(true);
    expect(sorted(pkg.devDependencies)).toBe(true);
    expect(buildPackageJson()).toBe(text);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("\r");
  });
});
