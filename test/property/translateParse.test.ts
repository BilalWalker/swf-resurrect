import fc from "fast-check";
import ts from "typescript-js";
import { describe, expect, it } from "vitest";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { translate, translateCore } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import type { TranslateOptions } from "../../src/translate/types";
import { fcConfig } from "./config";
import { genProgram, genSoup } from "./gen/genAs3";

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'MainTimeline',
  siblingClasses: new Set(["EventWatcher", "LeftButton", "RightButton", "MainTimeline"]),
  syntaxCheck: tsSyntaxCheck,
};

/** Independent parse: syntax errors reported by ts.transpileModule, not via tsSyntaxCheck. */
function parseErrors(text: string): string[] {
  const out = ts.transpileModule(text, {
    fileName: "independent.ts",
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
  });
  return (out.diagnostics ?? [])
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

// Feature: translate, Property 3: Output parses or the failure is reported
describe("Property 3: Output parses or the failure is reported", () => {
  /** **Validates: Requirements 1.5, 1.6, 3.5** */
  it("generated programs: translateCore output already parses, no fallback needed", () => {
    fc.assert(
      fc.property(genProgram, (p) => {
        const core = translateCore(p.source, options);
        expect(parseErrors(core.text)).toEqual([]);
        const full = translate(p.source, options);
        expect(parseErrors(full.text)).toEqual([]);
        expect(full.text).toBe(core.text);
      }),
      fcConfig,
    );
  }, 30_000);

  /** **Validates: Requirements 1.5, 1.6, 3.5** */
  it("token soup: output parses, and a failed core parse is reported on line 1", () => {
    fc.assert(
      fc.property(genSoup, (s) => {
        const full = translate(s, options);
        expect(parseErrors(full.text)).toEqual([]);
        if (s.trim() === "") {
          expect(full.text).toBe("");
          expect(full.diagnostics).toEqual([]);
          return;
        }
        const core = translateCore(s, options);
        if (parseErrors(core.text).length > 0) {
          const reported = full.diagnostics.some(
            (d) => d.kind === "unsupported-construct" && d.line === 1,
          );
          expect(reported, "line-1 unsupported-construct Diagnostic").toBe(true);
        }
      }),
      fcConfig,
    );
  }, 30_000);

  /** **Validates: Requirements 1.5, 1.6, 3.5** */
  it("blank input gives empty text", () => {
    for (const s of ["", " ", "\n", "\r\n\t  \n"]) {
      expect(translate(s, options).text).toBe("");
    }
  });
});
