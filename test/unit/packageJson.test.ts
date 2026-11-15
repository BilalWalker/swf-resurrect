import { readFileSync, readdirSync } from "node:fs";
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

describe("repo package.json", () => {
  it("has the gen:shim-members script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["gen:shim-members"]).toBe("tsx scripts/gen-shim-members.ts");
  });

  it("has the fetch:static-text script, and nothing else runs scripts/fetch-static-text.ts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["fetch:static-text"]).toBe("tsx scripts/fetch-static-text.ts");
    const naming = Object.entries(pkg.scripts as Record<string, string>)
      .filter(([, cmd]) => cmd.includes("fetch-static-text"))
      .map(([name]) => name);
    expect(naming).toEqual(["fetch:static-text"]);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts") && p !== "test/unit/packageJson.test.ts" && p !== "test/unit/fetchStaticText.test.ts") {
          if (/scripts\/fetch-static-text|fetch-static-text["']/.test(readFileSync(p, "utf8"))) offenders.push(p);
        }
      }
    };
    walk("src");
    walk("test");
    expect(offenders).toEqual([]);
  });
});
