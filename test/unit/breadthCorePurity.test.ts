import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Core files that must stay free of node:*, playwright, pngjs, clock, randomness and locale calls
 * (Requirement 15.2). Every sub-task that adds a Core file adds its path here.
 */
const CORE_FILES = [
  "src/emit/classOmissions.ts", // taken over from sub-task 4.2
  "src/convert/qualifiedName.ts",
];

const FORBIDDEN = [/node:/, /\bDate\b/, /Math\.random/, /localeCompare/, /toLocale/, /["']playwright["']/, /["']pngjs["']/];

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...listTs(p));
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name)) out.push(p);
  }
  return out.sort();
}

describe("Core purity", () => {
  const verifyCore = readdirSync(join("src", "verify", "core"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `src/verify/core/${f}`);

  for (const file of [...CORE_FILES, ...verifyCore]) {
    it(`${file} uses no node module, tool import, clock, randomness or locale call`, () => {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const re of FORBIDDEN) expect(re.test(code), `${file} ${re}`).toBe(false);
    });
  }

  it("lists existing Core files", () => {
    for (const file of CORE_FILES) expect(existsSync(file), file).toBe(true);
    expect(verifyCore.length).toBeGreaterThan(0);
  });
});

describe("typescript-js imports", () => {
  // The two production importers, plus one test that parses independently of tsSyntaxCheck on purpose.
  const ALLOWED = new Set([
    "src/translate/tsSyntaxCheck.ts",
    "src/translate/typeCheckGate.ts",
    "test/property/translateParse.test.ts",
  ]);
  const importRe = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']typescript-js["']/;

  it("is imported only by the allowed files", () => {
    const offenders = [...listTs("src"), ...listTs("scripts"), ...listTs("test")].filter(
      (f) => !ALLOWED.has(f) && importRe.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("is still imported by the two production files", () => {
    for (const f of ["src/translate/tsSyntaxCheck.ts", "src/translate/typeCheckGate.ts"]) {
      expect(importRe.test(readFileSync(f, "utf8")), f).toBe(true);
    }
  });
});
