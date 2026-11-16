import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { translate } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { fcConfig } from "../property/config";
import { genProgram } from "../property/gen/genAs3";

/**
 * Sub-task 29.3 (28.6 follow-up). translateDeterminism memoises the syntax check by text, so Property 1 no longer
 * calls tsSyntaxCheck twice on the same text. This test covers that: the real, unmemoised function gives deep-equal
 * results for the same text on repeated calls.
 */
function sameOnRepeat(text: string): void {
  const first = tsSyntaxCheck(text);
  const second = tsSyntaxCheck(text);
  const third = tsSyntaxCheck(text);
  expect(second).toEqual(first);
  expect(third).toEqual(first);
}

describe("tsSyntaxCheck determinism (28.6)", () => {
  it("gives the same result for the same text: valid, empty and multi-line texts", () => {
    sameOnRepeat("");
    sameOnRepeat("export class A {\n  x: number = 1;\n  f(): void { this.x++; }\n}\n");
    sameOnRepeat("const a = 1;\r\nconst b = a + 2;\r\n");
  });

  it("gives the same non-empty list for texts with syntax errors", () => {
    for (const text of ["class {", "let = ;\nfoo(", "export function f( { return 1 }\n}}}\n"]) {
      expect(tsSyntaxCheck(text).length).toBeGreaterThan(0);
      sameOnRepeat(text);
    }
  });

  // Feature: translate, Property 1 follow-up: the syntax check is a pure function of the text
  it("gives the same result on repeated calls for translated generated programs", () => {
    fc.assert(
      fc.property(genProgram, (p) => {
        const out = translate(p.source, {
          shimNames: SHIM_AS3_NAMES,
          selfQualified: "MainTimeline",
          siblingClasses: new Set(["EventWatcher", "LeftButton", "RightButton", "MainTimeline"]),
          syntaxCheck: () => [],
        });
        sameOnRepeat(out.text);
      }),
      fcConfig,
    );
  });
});
