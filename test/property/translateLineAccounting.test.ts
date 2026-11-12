import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { escapeComment } from "../../src/translate/emitTs";
import { SHIM_AS3_NAMES, SHIM_MOVIECLIP_MEMBERS } from "../../src/translate/shimNames";
import { translate } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import type { TranslateOptions, TranslateResult } from "../../src/translate/types";
import { fcConfig } from "./config";
import { genProgram, genSoup } from "./gen/genAs3";

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  shimMembers: SHIM_MOVIECLIP_MEMBERS,
  selfQualified: 'MainTimeline',
  siblingClasses: new Set(["EventWatcher", "LeftButton", "RightButton", "MainTimeline"]),
  syntaxCheck: tsSyntaxCheck,
};

/** Source lines as the Transpiler counts them: CRLF is one break, a final break starts no line. */
function sourceLines(source: string): string[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** (c) and (d), shared by programs and token soup. */
function checkSpans(source: string, result: TranslateResult): void {
  const lines = sourceLines(source);
  const n = lines.length;
  for (const span of result.spans) {
    expect(span.startLine).toBeGreaterThanOrEqual(1);
    expect(span.endLine).toBeLessThanOrEqual(n);
    expect(span.startLine).toBeLessThanOrEqual(span.endLine);
  }
  // (c) every non-blank line is covered.
  lines.forEach((line, i) => {
    if (line.trim() === "") return;
    const covered = result.spans.some((s) => s.startLine <= i + 1 && i + 1 <= s.endLine);
    expect(covered, `line ${i + 1} not covered: ${JSON.stringify(line)}`).toBe(true);
  });
  // (d) each non-blank line of an unsupported span appears as an AS3 comment, in order.
  const outLines = result.text.split("\n");
  for (const span of result.spans) {
    if (span.kind !== "unsupported") continue;
    let from = 0;
    for (let ln = span.startLine; ln <= span.endLine; ln++) {
      const line = lines[ln - 1];
      if (line.trim() === "") continue;
      // The first line of a statement starts at its first token, so indentation is not compared.
      // Comments before the first token or after the last token of the statement are emitted
      // as their own lines, so the edge lines of a span may carry only part of the source line.
      // Trailing whitespace, including escaped U+2028/2029, is not significant.
      const norm = (s: string): string => s.trim().replace(/(\\u202[89])+$/, "").trim();
      const want = norm(escapeComment(line));
      const edge = ln === span.startLine || ln === span.endLine;
      let found = -1;
      for (let j = from; j < outLines.length; j++) {
        const o = outLines[j].trim();
        if (!o.startsWith("// AS3:")) continue;
        const got = norm(o.slice("// AS3:".length));
        if (got === want || (edge && got !== "" && want.includes(got))) {
          found = j;
          break;
        }
      }
      expect(found, `line ${ln} missing from AS3 comments: ${JSON.stringify(line)}`).toBeGreaterThanOrEqual(0);
      from = found + 1;
    }
  }
}

// Feature: translate, Property 2: Every source line is accounted for
describe("Property 2: Every source line is accounted for", () => {
  /** **Validates: Requirements 1.3, 1.4, 3.5** */
  it("accounts for every marker, unsupported statement and source line (generated programs)", () => {
    fc.assert(
      fc.property(genProgram, (p) => {
        const result = translate(p.source, options);

        // (a) each marker exactly once in the output.
        for (const st of p.statements) {
          const count = result.text.split(st.marker).length - 1;
          expect(count, `marker ${st.marker}`).toBe(1);
        }

        // (b) one unsupported-construct Diagnostic per unsupported statement, none other.
        const expected = p.statements.filter((s) => s.unsupported).map((s) => s.firstLine).sort((a, b) => a - b);
        const actual = result.diagnostics
          .filter((d) => d.kind === "unsupported-construct")
          .map((d) => d.line)
          .sort((a, b) => a - b);
        expect(actual).toEqual(expected);

        expect(sourceLines(p.source).length).toBe(p.lineCount);
        checkSpans(p.source, result);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 1.3, 1.4, 3.5** */
  it("covers every non-blank line within range and does not throw (token soup)", () => {
    fc.assert(
      fc.property(genSoup, (s) => {
        const result = translate(s, options);
        checkSpans(s, result);
      }),
      fcConfig,
    );
  });
});
