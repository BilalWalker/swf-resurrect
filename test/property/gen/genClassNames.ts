// Generators for Property 20 (Qualified_Name safety).
import fc from "fast-check";

const hostileSegment = fc.constantFrom("", ".", "..", "a/b", "a\\b", "C:x", "a\0b", "a\nb", "a\tb", "a*", "a?", "a|b", 'a"b', "a<b", "a>b");
const validSegment = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,8}$/);

export const genValidQualifiedName: fc.Arbitrary<string> = fc
  .array(validSegment, { minLength: 1, maxLength: 5 })
  .map((segs) => segs.join("."));

/** Case-only variants of a valid name are distinct valid names. */
export const genCaseVariantPair: fc.Arbitrary<[string, string]> = genValidQualifiedName.map((n) => [n, n.toUpperCase()]);

const hostileName = fc
  .array(fc.oneof(validSegment, hostileSegment), { minLength: 1, maxLength: 5 })
  .map((segs) => segs.join("."));

export const genAnyClassName: fc.Arbitrary<string> = fc.oneof(
  genValidQualifiedName,
  hostileName,
  fc.string({ maxLength: 20 }),
  fc.string({ unit: "binary", maxLength: 12 }),
);

// ---------------------------------------------------------------------------
// Property 22: file contexts for planFileImports.
import type { ImportPlanInput } from "../../../src/translate/importPlan";

const PKGS = ["", "a", "b", "a.b"];
const SIMPLES = ["X", "Y", "Z"];
const ALL_QNS = PKGS.flatMap((p) => SIMPLES.map((s) => (p === "" ? s : `${p}.${s}`)));

/** A small closed universe makes clashes (same simple name, several levels) frequent. */
export const genImportPlanInput: fc.Arbitrary<ImportPlanInput> = fc
  .record({
    self: fc.constantFrom(...ALL_QNS, "a.Self", "Self"),
    known: fc.subarray(ALL_QNS),
    declared: fc.subarray(SIMPLES),
    shim: fc.subarray([...SIMPLES, "Sprite"]),
    explicit: fc.subarray(ALL_QNS),
    wild: fc.subarray(PKGS.filter((p) => p !== "")),
    bare: fc.subarray([...SIMPLES, "Sprite", "Q"]),
    chains: fc.subarray(ALL_QNS),
    forced: fc.subarray(ALL_QNS),
  })
  .map((r) => ({
    selfQualified: r.self,
    declared: new Set(r.declared),
    shimNames: new Set(r.shim),
    known: new Set(r.known),
    imports: [
      ...r.explicit.filter((q) => q.includes(".")).map((path) => ({ path, wildcard: false })),
      ...r.wild.map((path) => ({ path, wildcard: true })),
    ],
    bare: new Map(r.bare.map((n, i) => [n, i + 1] as [string, number])),
    chains: r.chains.map((qn, i) => ({ text: qn, qn, line: i + 1 })),
    forced: r.forced,
  }));

// ---------------------------------------------------------------------------
// Property 11: class name sets with case-only variants and reserved names.
const P11_DIRS = ["a", "A", "b", "a_class", "src"];
const P11_FILES = ["Main", "main", "Foo", "foo", "Classes", "classes", "TimelineOnly", "X"];
export const P11_RESERVED = ["src/main.ts", "src/classes.ts", "src/timelineOnly.ts", "package.json", "assets/a.png"];
const p11Name = fc
  .tuple(fc.array(fc.constantFrom(...P11_DIRS), { maxLength: 3 }), fc.constantFrom(...P11_FILES))
  .map(([pkg, simple]) => [...pkg, simple].join("."));
export const genClassNameSet: fc.Arbitrary<string[]> = fc.uniqueArray(p11Name, { maxLength: 12 });
