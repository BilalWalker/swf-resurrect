import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { translate } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { fcConfig } from "./config";
import { genTypeUse } from "./gen/genTypeUse";

describe("type-position imports", () => {
  // Feature: as3-coverage, Property 1: Shim classes in type positions are imported once
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  it("a Shim class named in a type position, an expression or both has exactly one import", () => {
    fc.assert(
      fc.property(genTypeUse, ({ name, source }) => {
        const r = translate(source, { shimNames: SHIM_AS3_NAMES, selfQualified: "p.C", siblingClasses: new Set(["p.C"]) as never, syntaxCheck: tsSyntaxCheck });
        const lines = r.text.split("\n").filter((l) => l.startsWith("import ") && new RegExp(`[{ ,]${name}[ ,}]`).test(l));
        expect(lines).toHaveLength(1);
      }),
      fcConfig,
    );
  });
});
