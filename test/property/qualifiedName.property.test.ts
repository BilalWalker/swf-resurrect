import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InvalidClassNameError,
  canonicalClassPath,
  isSafeSegment,
  parseQualifiedName,
  qualifiedFromScriptPath,
  scriptRelPath,
} from "../../src/convert/qualifiedName";
import { fcConfig } from "./config";
import { genAnyClassName, genCaseVariantPair, genValidQualifiedName } from "./gen/genClassNames";

/** Pure path normaliser: returns null when the relative path climbs above its base. */
function resolveInside(rel: string): string[] | null {
  const out: string[] = [];
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out;
}

describe("qualifiedName properties", () => {
  // Feature: breadth, Property 20: Qualified names never escape the scripts directory
  // **Validates: Requirements 18.1, 18.2**
  it("parseQualifiedName throws naming the input or returns only safe segments", () => {
    fc.assert(
      fc.property(genAnyClassName, (s) => {
        let parts;
        try {
          parts = parseQualifiedName(s);
        } catch (e) {
          expect(e).toBeInstanceOf(InvalidClassNameError);
          expect((e as Error).message).toContain(s);
          return;
        }
        for (const seg of [...parts.pkg, parts.simple]) expect(isSafeSegment(seg)).toBe(true);
      }),
      fcConfig,
    );
  });

  it("valid names map to scripts paths that stay inside and round-trip", () => {
    fc.assert(
      fc.property(genValidQualifiedName, (n) => {
        const parts = parseQualifiedName(n);
        const rel = scriptRelPath(n);
        const segs = rel.split("/");
        expect(segs).toHaveLength(parts.pkg.length + 1);
        for (const s of segs) expect(["", ".", ".."]).not.toContain(s);
        expect(resolveInside(rel)).toHaveLength(segs.length);
        expect(qualifiedFromScriptPath(rel)).toBe(n);
        expect(canonicalClassPath(n)).toBe("src/" + rel.replace(/\.as$/, ".ts"));
      }),
      fcConfig,
    );
  });

  it("case-only variants stay distinct keys", () => {
    fc.assert(
      fc.property(genCaseVariantPair, ([a, b]) => {
        if (a !== b) expect(scriptRelPath(a)).not.toBe(scriptRelPath(b));
        expect(qualifiedFromScriptPath(scriptRelPath(b))).toBe(b);
      }),
      fcConfig,
    );
  });
});
