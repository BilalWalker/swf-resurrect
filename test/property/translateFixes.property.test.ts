import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { selfKey } from "../../src/translate/rewrite";
import { planTranslate } from "../../src/translate/planTranslate";
import { translateCore } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
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

describe("Property 56: A rolled-back statement leaves no forced import", () => {
  const klass = fc.stringMatching(/^[A-Z][a-z]{2,6}$/);
  const member = fc.stringMatching(/^[a-z][a-z]{2,6}$/);
  /** Statements that fall back to // AS3: comments after their first expression was rewritten. */
  const unsupported = (m: string): readonly string[] => [
    `for (var i:int = ${m}(); int(); i++) {}`,
    `for (var i:int = ${m}(); i < int(); i++) {}`,
    `${m}(int());`,
  ];
  const genCase = fc
    .record({ a: klass, c: klass, m: member, which: fc.nat({ max: 2 }), kept: fc.boolean() })
    .filter((x) => new Set([x.a, x.c, "Leaf"]).size === 3);

  /** **Validates: Requirements 30.3, 30.5** */
  it("imports the declaring class only when a kept statement uses the inherited static", () => {
    fc.assert(
      fc.property(genCase, (x) => {
        const body = (x.kept ? `${x.m}(); ` : "") + unsupported(x.m)[x.which];
        const sources = [
          {
            className: `p.${x.a}`,
            source: `package p { import flash.display.Sprite; public class ${x.a} extends Sprite { public static function ${x.m}():int { return 1; } } }`,
          },
          { className: `p.${x.c}`, source: `package p { public class ${x.c} extends ${x.a} {} }` },
          {
            className: "q.Leaf",
            source: `package q { import p.${x.c}; public class Leaf extends ${x.c} { public function go():void { ${body} } } }`,
          },
        ];
        const scene = {
          formatVersion: 1,
          rootSymbolId: 0,
          symbols: { "0": { type: "sprite", frames: [], labels: {}, className: "q.Leaf" } },
        } as never;
        const text = planTranslate(sources, scene, tsSyntaxCheck).classes.find((c) => c.className === "q.Leaf")!.text;
        expect(text).toContain("// AS3:");
        expect(new RegExp(`^import \{ ${x.a} \}`, "m").test(text)).toBe(x.kept);
      }),
      fcConfig,
    );
  });
});