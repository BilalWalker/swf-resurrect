import fc from "fast-check";
import type { LinkedSymbol, OmissionClass } from "../../../src/emit/classOmissions";
import type { GateError } from "../../../src/translate/typeCheckGate";

export interface OmissionProject {
  gateErrors: GateError[];
  classes: OmissionClass[];
  linked: LinkedSymbol[];
}

const CODES = [2307, 2792, 2305, 2306, 2322, 2339, 1155, 1005, 2304];
const SPECIFIERS = ["./Nope", "../Missing", "../shim/Missing", "../../shim/X", "./runtime/x", "../runtime/y", "pixi.js", "shim", "./A/B"];
const OTHER_FILES = ["src/classes.ts", "src/main.ts", "runtime/player.ts", "shim/Sprite.ts"];

/** Projects with an extends graph, an import graph (cycles allowed), gate errors, handwritten flags and linked symbols. */
export const projectArb: fc.Arbitrary<OmissionProject> = fc.integer({ min: 0, max: 7 }).chain((n) => {
  const names = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? `C${i}` : `pk.C${i}`));
  const pathOf = (name: string) => `src/${name.replace(/\./g, "/")}.ts`;
  // A base or import may also name a class that is not emitted.
  const targets = [...names, "ghost.Base"];
  const classArb = (name: string): fc.Arbitrary<OmissionClass> =>
    fc.record({
      className: fc.constant(name),
      path: fc.constant(pathOf(name)),
      extendsQualified: fc.option(fc.constantFrom(...targets), { nil: null }),
      importsQualified: fc.uniqueArray(fc.constantFrom(...targets), { maxLength: 4 }).map((a) => a.sort()),
      handwritten: fc.boolean(),
      produced: fc.oneof({ weight: 5, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    });
  const filesForErrors = [...names.map(pathOf), ...OTHER_FILES];
  const errorArb: fc.Arbitrary<GateError> = fc.record({
    file: fc.constantFrom(...filesForErrors),
    line: fc.integer({ min: 1, max: 30 }),
    column: fc.integer({ min: 1, max: 20 }),
    code: fc.constantFrom(...CODES),
    message: fc.constantFrom("m1", "m2", "m3"),
    syntactic: fc.boolean(),
    specifier: fc.option(fc.constantFrom(...SPECIFIERS), { nil: null }),
  });
  const linkedNames = [...names, "lone.Unsourced", "Orphan"];
  return fc.record({
    classes: fc.tuple(...names.map(classArb)) as fc.Arbitrary<OmissionClass[]>,
    gateErrors: fc.array(errorArb, { maxLength: 12 }),
    linked: fc.array(
      fc.record({ symbolId: fc.integer({ min: 1, max: 50 }), className: fc.constantFrom(...linkedNames) }),
      { maxLength: 8 },
    ),
  });
});
