import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { selfKey } from "../../src/translate/rewrite";
import { translateCore } from "../../src/translate/translate";
import { fcConfig } from "./config";
import { genDottedAnnotationCase } from "./gen/genClassContext";

function run(source: string, known: readonly string[]) {
  return translateCore(source, {
    shimNames: SHIM_AS3_NAMES,
    selfQualified: "app.Main",
    siblingClasses: new Set(known),
    syntaxCheck: () => [],
  });
}

/** The annotation text of the five generated positions, read back from the emitted lines. */
function annotations(text: string): string[] {
  const grab = (re: RegExp): string => re.exec(text)?.[1] ?? "<missing>";
  return [
    grab(/fld: ([\w.]+)/),
    grab(/\(arg: ([\w.]+)\)/),
    grab(/\): ([\w.]+) \{/),
    grab(/loc: ([\w.]+) =/),
    grab(/vec: ([\w.]+)\[\]/),
  ];
}

describe("Property 54: A dotted type annotation resolves through the import plan", () => {
  /** **Validates: Requirements 30.1, 30.5** */
  it("writes the binding for an annotation with a source, imports it, and keeps the rest as written", () => {
    fc.assert(
      fc.property(genDottedAnnotationCase, (c) => {
        const r = run(c.source, c.known);
        expect(annotations(r.text)).toEqual(c.expected);
        for (const q of new Set(c.resolved)) {
          expect(r.importRecords.some((x) => x.kind === "class" && x.target === q)).toBe(true);
        }
        expect(r.importRecords.filter((x) => x.kind === "class")).toHaveLength(new Set(c.resolved).size);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 30.1, 30.5** */
  it("gives the same output for any order of the known classes", () => {
    fc.assert(
      fc.property(
        genDottedAnnotationCase.chain((c) => fc.record({ c: fc.constant(c), shuffled: fc.shuffledSubarray(c.known, { minLength: c.known.length }) })),
        ({ c, shuffled }) => {
          expect(run(c.source, shuffled).text).toBe(run(c.source, c.known).text);
        },
      ),
      fcConfig,
    );
  });
});
describe("Property 55: selfKey is the qualified name", () => {
  const ident = fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,7}$/);
  const klass = fc.stringMatching(/^[A-Z][a-zA-Z0-9_]{0,7}$/);
  const pkg = fc.array(ident, { minLength: 1, maxLength: 3 }).map((p) => p.join("."));
  /** **Validates: Requirements 30.2, 30.5** */
  it("is <package>.<ClassName> for a secondary class and never starts with (", () => {
    fc.assert(
      fc.property(pkg, klass, klass, (p, main, other) => {
        fc.pre(main !== other);
        const key = selfKey(`${p}.${main}`, other);
        expect(key).toBe(`${p}.${other}`);
        expect(key.startsWith("(")).toBe(false);
        expect(selfKey(`${p}.${main}`, main)).toBe(`${p}.${main}`);
        expect(selfKey(main, other)).toBe(other);
      }),
      fcConfig,
    );
  });
});
