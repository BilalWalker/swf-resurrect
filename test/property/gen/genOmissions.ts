import fc from "fast-check";
import type { LinkedSymbol, OmissionClass } from "../../../src/emit/classOmissions";
import type { GateError } from "../../../src/translate/typeCheckGate";

export interface OmissionProject {
  gateErrors: GateError[];
  classes: OmissionClass[];
  linked: LinkedSymbol[];
}

const BINDINGS = ['A', 'B'];
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
      // Export surface: absent (not checked), unknown (null) or a subset of the names importers use.
      exports: fc.oneof(fc.constant(undefined), fc.constant(null), fc.subarray(BINDINGS)),
      importedNames: fc.array(
        fc.record({ target: fc.constantFrom(...targets), name: fc.constantFrom(...BINDINGS), line: fc.integer({ min: 1, max: 9 }) }),
        { maxLength: 3 },
      ),
    }).map(({ exports, importedNames, ...rest }) => ({
      ...rest,
      // A binding is imported from a class the file imports.
      importsQualified: [...new Set([...rest.importsQualified, ...importedNames.map((i) => i.target)])].sort(),
      importedNames,
      ...(exports === undefined ? {} : { exports }),
    }));
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

const SURVIVING_NAMES = [...BINDINGS, '*'];

/** What a class file's edges look like in the emitted text: `./T` or `../T` for a target T. */
const edgeSpecifiers = (target: string): string[] => [`./${target}`, `../${target}`];

/**
 * A project whose classes carry the edge specifiers, the specifier on every imported name and, when `checked`,
 * a Bundler_Check per class (verdict ok or not, Surviving_Imports a random subset of the candidate specifiers).
 * When `checked` is false no class has a check: the guard could not run.
 */
export const bundledProjectArb: fc.Arbitrary<OmissionProject & { checked: boolean }> = fc
  .tuple(projectArb, fc.boolean())
  .chain(([project, checked]) =>
    fc
      .tuple(
        ...project.classes.map((c) =>
          fc
            .tuple(
              fc.array(fc.constantFrom(0, 1), { minLength: c.importsQualified.length, maxLength: c.importsQualified.length }),
              fc.array(fc.constantFrom(0, 1), { minLength: (c.importedNames ?? []).length, maxLength: (c.importedNames ?? []).length }),
              fc.oneof(
                { weight: 4, arbitrary: fc.constant<{ ok: true }>({ ok: true }) },
                {
                  weight: 1,
                  arbitrary: fc.record({
                    ok: fc.constant<false>(false),
                    phase: fc.constantFrom<'transform' | 'parse'>('transform', 'parse'),
                    message: fc.constantFrom('m1', 'm2'),
                    line: fc.integer({ min: 1, max: 9 }),
                    column: fc.integer({ min: 1, max: 9 }),
                  }),
                },
              ),
              fc.uniqueArray(fc.nat({ max: 40 }), { maxLength: 40 }),
              fc.array(fc.subarray(SURVIVING_NAMES), { minLength: 40, maxLength: 40 }),
            )
            .map(([edgePick, namePick, verdict, keep, names]): OmissionClass => {
              const edges = c.importsQualified.map((target, i) => ({ target, specifier: edgeSpecifiers(target)[edgePick[i]] }));
              const importedNames = (c.importedNames ?? []).map((n, i) => ({
                ...n,
                specifier: edgeSpecifiers(n.target)[namePick[i]],
              }));
              // Candidates: every edge specifier of this class plus the specifiers the gate errors use.
              const candidates = [...new Set([...edges.map((e) => e.specifier), ...importedNames.map((n) => n.specifier), ...SPECIFIERS])].sort();
              const imports = candidates
                .map((specifier, i) => ({ specifier, names: [...names[i]].sort(), keep: keep.includes(i) }))
                .filter((i) => i.keep)
                .map(({ specifier, names: ns }) => ({ specifier, names: ns }));
              return {
                ...c,
                importedNames,
                importEdges: edges,
                ...(checked ? { bundler: { verdict, imports } } : {}),
              };
            }),
        ),
      )
      .map((classes) => ({ ...project, classes: classes as OmissionClass[], checked })),
  );
