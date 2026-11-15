import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { translate } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import type { SyntaxCheck, TranslateOptions } from "../../src/translate/types";
import { fcConfig } from "./config";
import { genProgram, genSoup } from "./gen/genAs3";

/**
 * tsSyntaxCheck is a pure function of the text and costs about 3.8 ms per call, 93% of a translate call (profiled in task 28.6).
 * check translates each program four times and the four outputs are mostly the same text, so the injected check is
 * memoised by text for this file. Translate's own output and diagnostics are still compared on every call.
 */
const syntaxCache = new Map<string, ReturnType<SyntaxCheck>>();
const cachedSyntaxCheck: SyntaxCheck = (text) => {
  let hit = syntaxCache.get(text);
  if (hit === undefined) {
    hit = tsSyntaxCheck(text);
    syntaxCache.set(text, hit);
  }
  return hit;
};

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'MainTimeline',
  siblingClasses: new Set(["EventWatcher", "LeftButton", "RightButton", "MainTimeline"]),
  syntaxCheck: cachedSyntaxCheck,
};

function check(source: string): void {
  const first = translate(source, options);
  const second = translate(source, options);
  expect(second.text).toBe(first.text);
  expect(second.diagnostics).toEqual(first.diagnostics);

  const lf = source.replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  const a = translate(lf, options);
  const b = translate(crlf, options);
  expect(b.text).toBe(a.text);
  expect(b.diagnostics).toEqual(a.diagnostics);
}

// Feature: translate, Property 1: Translation is deterministic
describe("Property 1: Translation is deterministic", () => {
  /** **Validates: Requirements 1.1, 1.2** */
  it("gives identical text and diagnostics for repeated runs and for CRLF vs LF (generated programs)", () => {
    fc.assert(fc.property(genProgram, (p) => check(p.source)), fcConfig);
  });

  /** **Validates: Requirements 1.1, 1.2** */
  it("gives identical text and diagnostics for repeated runs and for CRLF vs LF (token soup)", () => {
    fc.assert(fc.property(genSoup, (s) => check(s)), fcConfig);
  });
});
