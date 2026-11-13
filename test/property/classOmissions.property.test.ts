import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decideClassOmissions, isEmittedSpecifier, looseClasses, type OmissionClass } from "../../src/emit/classOmissions";
import type { GateError } from "../../src/translate/typeCheckGate";
import { gateError } from "../support/gateError";
import { buildClassesTs } from "../../src/emit/planEmit";
import type { SceneJson } from "../../template/runtime/scene";
import { bundledProjectArb, projectArb } from "./gen/genOmissions";
import { fcConfig } from "./config";

/** **Validates: Requirements 23.1, 23.2, 23.3** */
describe("Property 38: The omitted set", () => {
  it("is exactly the least set closed under the rules, and loose classes are the rest with errors", () => {
    fc.assert(
      fc.property(projectArb, ({ gateErrors, classes, linked }) => {
        const names = new Set(classes.map((c) => c.className));
        const expected = new Set<string>();
        for (const s of linked) if (!names.has(s.className)) expected.add(s.className);
        for (const c of classes) {
          if (c.handwritten) continue;
          const own = gateErrors.filter((e) => e.file === c.path);
          const cannotLoad =
            !c.produced ||
            own.some((e) => e.syntactic) ||
            own.some(
              (e) =>
                (e.code === 2307 || e.code === 2792) &&
                e.specifier !== null &&
                e.specifier.startsWith(".") &&
                isEmittedSpecifier(c.path, e.specifier),
            );
          // An imported binding that the planned target file does not export cannot link.
          const missingExport = (c.importedNames ?? []).some((i) => {
            const t = classes.find((k) => k.className === i.target);
            return i.target !== c.className && t !== undefined && t.exports != null && !t.exports.includes(i.name);
          });
          if (cannotLoad || missingExport) expected.add(c.className);
        }
        let changed = true;
        while (changed) {
          changed = false;
          for (const c of classes) {
            if (c.handwritten || expected.has(c.className)) continue;
            if ((c.extendsQualified !== null && expected.has(c.extendsQualified)) || c.importsQualified.some((i) => expected.has(i))) {
              expected.add(c.className);
              changed = true;
            }
          }
        }

        const result = decideClassOmissions(gateErrors, classes, linked);
        expect(result.map((o) => o.className)).toEqual([...expected].sort());
        for (const o of result) {
          expect(o.symbolIds).toEqual(linked.filter((s) => s.className === o.className).map((s) => s.symbolId).sort((a, b) => a - b));
          if (o.reason.kind === "extends-omitted") expect(expected.has(o.reason.base)).toBe(true);
          if (o.reason.kind === "imports-omitted") expect(expected.has(o.reason.imported)).toBe(true);
          if (o.reason.kind === "missing-export") {
            const r = o.reason;
            const t = classes.find((k) => k.className === r.target)!;
            expect(t.exports!.includes(r.name)).toBe(false);
          }
        }
        for (const c of classes) if (c.handwritten) expect(result.some((o) => o.className === c.className)).toBe(false);

        // Order independence.
        const again = decideClassOmissions([...gateErrors].reverse(), [...classes].reverse(), [...linked].reverse());
        expect(again).toEqual(result);

        const loose = looseClasses(gateErrors, classes, result);
        const wantLoose = classes
          .filter((c) => !c.handwritten && !expected.has(c.className) && gateErrors.some((e) => e.file === c.path))
          .map((c) => c.className)
          .sort();
        expect(loose.map((l) => l.className)).toEqual(wantLoose);
        for (const l of loose) expect(l.count).toBe(gateErrors.filter((e) => e.file === classes.find((c) => c.className === l.className)!.path).length);
      }),
      fcConfig,
    );
  });
});

/** **Validates: Requirements 26.2, 26.4, 26.5, 26.6, 26.10, 26.12, 23.1, 23.3** */
describe("Property 49: The omitted set depends on load failures and Surviving_Imports only", () => {
  /** The least fixed point of the rules of design 21.4, written without reading decideClassOmissions. */
  function expectedSet(gateErrors: GateError[], classes: OmissionClass[], linked: { className: string }[]): Set<string> {
    const names = new Set(classes.map((c) => c.className));
    const out = new Set<string>();
    for (const s of linked) if (!names.has(s.className)) out.add(s.className);
    for (const c of classes) {
      const b = c.bundler;
      if (b !== undefined && !b.verdict.ok && (c.handwritten || c.produced)) {
        out.add(c.className);
        continue;
      }
      if (c.handwritten) continue;
      if (!c.produced) {
        out.add(c.className);
        continue;
      }
      const own = gateErrors.filter((e) => e.file === c.path);
      const specs = new Set((b?.imports ?? []).map((i) => i.specifier));
      const syntactic = b === undefined && own.some((e) => e.syntactic);
      const unresolved = own.some(
        (e) =>
          (e.code === 2307 || e.code === 2792) &&
          e.specifier !== null &&
          e.specifier.startsWith(".") &&
          isEmittedSpecifier(c.path, e.specifier) &&
          (b === undefined || specs.has(e.specifier)),
      );
      const missing = (c.importedNames ?? []).some((i) => {
        const t = classes.find((k) => k.className === i.target);
        if (i.target === c.className || t === undefined || t.exports == null || t.exports.includes(i.name)) return false;
        if (b === undefined || i.specifier === undefined) return true;
        return b.imports.some((s) => s.specifier === i.specifier && (s.names.includes(i.name) || s.names.includes("*")));
      });
      if (syntactic || unresolved || missing) out.add(c.className);
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (const c of classes) {
        if (c.handwritten || out.has(c.className)) continue;
        const kept = new Set((c.bundler?.imports ?? []).map((i) => i.specifier));
        const edgeTargets =
          c.bundler === undefined || c.importEdges === undefined
            ? c.importsQualified
            : c.importEdges.filter((e) => kept.has(e.specifier)).map((e) => e.target);
        const reached = c.importsQualified.filter((n) => edgeTargets.includes(n));
        if ((c.extendsQualified !== null && out.has(c.extendsQualified)) || reached.some((n) => out.has(n))) {
          out.add(c.className);
          changed = true;
        }
      }
    }
    return out;
  }

  it("is the least fixed point of the rules, independent of input order", () => {
    fc.assert(
      fc.property(bundledProjectArb, ({ gateErrors, classes, linked }) => {
        const expected = expectedSet(gateErrors, classes, linked);
        const result = decideClassOmissions(gateErrors, classes, linked);
        expect(result.map((o) => o.className)).toEqual([...expected].sort());
        expect(new Set(result.map((o) => o.className)).size).toBe(result.length);
        expect(decideClassOmissions([...gateErrors].reverse(), [...classes].reverse(), [...linked].reverse())).toEqual(result);
        for (const o of result) {
          if (o.reason.kind === "bundler-parse") {
            const c = classes.find((k) => k.className === o.className)!;
            expect(c.bundler !== undefined && !c.bundler.verdict.ok).toBe(true);
          }
          // A syntax-error reason needs a class with no check.
          if (o.reason.kind === "syntax-error") expect(classes.find((k) => k.className === o.className)!.bundler).toBeUndefined();
        }
        // The registry holds no class that extends an omitted class or has a surviving import of one.
        const omitted = new Set(result.map((o) => o.className));
        for (const c of classes) {
          if (c.handwritten || omitted.has(c.className)) continue;
          if (c.extendsQualified !== null) expect(omitted.has(c.extendsQualified)).toBe(false);
          if (c.bundler === undefined || c.importEdges === undefined) {
            for (const n of c.importsQualified) expect(omitted.has(n)).toBe(false);
          } else {
            const kept = new Set(c.bundler.imports.map((i) => i.specifier));
            for (const e of c.importEdges) if (kept.has(e.specifier)) expect(omitted.has(e.target)).toBe(false);
          }
        }
      }),
      fcConfig,
    );
  });

  it("with checks present, a syntactic diagnostic never omits; with none it does", () => {
    fc.assert(
      fc.property(bundledProjectArb, fc.constantFrom(1005, 1155, 2304, 8000), ({ classes, linked, checked }, code) => {
        // Only syntactic diagnostics, on every class file, and nothing else that could omit.
        const clean = classes.map((c) => ({ ...c, produced: true, importedNames: [], importsQualified: [], importEdges: [], extendsQualified: null }));
        const errs = clean.map((c) => gateError({ file: c.path, code, syntactic: true }));
        const ok = clean.map((c) => (c.bundler === undefined ? c : { ...c, bundler: { verdict: { ok: true as const }, imports: c.bundler.imports } }));
        const result = decideClassOmissions(errs, ok, linked.filter((s) => classes.some((c) => c.className === s.className)));
        const dropped = new Set(result.map((o) => o.className));
        for (const c of ok) {
          if (c.handwritten) expect(dropped.has(c.className)).toBe(false);
          else expect(dropped.has(c.className)).toBe(!checked);
        }
        if (!checked) for (const o of result) expect(o.reason.kind).toBe("syntax-error");
      }),
      fcConfig,
    );
  });

  it("removing an import from the Surviving_Imports never adds a class", () => {
    fc.assert(
      fc.property(bundledProjectArb, fc.nat({ max: 20 }), fc.nat({ max: 20 }), ({ gateErrors, classes, linked }, ci, ii) => {
        const withChecks = classes.filter((c) => c.bundler !== undefined);
        if (withChecks.length === 0) return;
        const target = withChecks[ci % withChecks.length];
        if (target.bundler!.imports.length === 0) return;
        const drop = ii % target.bundler!.imports.length;
        const fewer = classes.map((c) =>
          c === target ? { ...c, bundler: { ...c.bundler!, imports: c.bundler!.imports.filter((_, k) => k !== drop) } } : c,
        );
        const before = new Set(decideClassOmissions(gateErrors, classes, linked).map((o) => o.className));
        const after = decideClassOmissions(gateErrors, fewer, linked).map((o) => o.className);
        for (const n of after) expect(before.has(n)).toBe(true);
      }),
      fcConfig,
    );
  });
});

/** **Validates: Requirements 23.1, 23.2, 23.3, 26.5** (D41: Property 38 and 49 with module-evaluation ranges) */
describe("Properties 38 and 49 with module-evaluation ranges: load-time-error", () => {
  const rangesArb = fc.array(fc.record({ line: fc.integer({ min: 1, max: 30 }), len: fc.integer({ min: 1, max: 4 }) }), { maxLength: 3 });
  const lineIn = (rs: { line: number; len: number }[], e: GateError) => rs.some((r) => e.line >= r.line && e.line < r.line + r.len);

  it("omits exactly the non-handwritten classes with a non-syntactic error in a range, then closes under propagation", () => {
    fc.assert(
      fc.property(bundledProjectArb, fc.array(rangesArb, { minLength: 8, maxLength: 8 }), ({ gateErrors, classes, linked }, perClass) => {
        const withRanges = classes.map((c, i): OmissionClass => ({
          ...c,
          moduleEval: perClass[i % perClass.length].map((r) => ({ line: r.line, column: 1, endLine: r.line + r.len, endColumn: 1 })),
        }));
        const result = decideClassOmissions(gateErrors, withRanges, linked);
        const got = new Set(result.map((o) => o.className));

        // Oracle: a class with a load-time error is a base failure (modelled as a missing file), then the old oracle.
        const failing = (c: OmissionClass, i: number): boolean =>
          !c.handwritten &&
          c.produced &&
          gateErrors.some((e) => e.file === c.path && !e.syntactic && lineIn(perClass[i % perClass.length], e));
        const asBase = classes.map((c, i) => (failing(withRanges[i], i) ? { ...c, produced: false, bundler: undefined } : c));
        const expected = new Set(decideClassOmissions(gateErrors, asBase, linked).map((o) => o.className));
        expect(got).toEqual(expected);

        for (const o of result) {
          const reason = o.reason;
          if (reason.kind !== "load-time-error") continue;
          const i = withRanges.findIndex((c) => c.className === o.className);
          const mine = gateErrors.filter((e) => e.file === withRanges[i].path && !e.syntactic && lineIn(perClass[i % perClass.length], e));
          expect(mine.some((e) => e.code === reason.code && e.line === reason.line)).toBe(true);
        }
        // Without ranges the result is the one of the old rules.
        expect(new Set(decideClassOmissions(gateErrors, classes, linked).map((o) => o.className)).size).toBeLessThanOrEqual(got.size);
        // A class that survives has no load-time error and no omitted base or surviving import.
        for (const c of withRanges) if (!got.has(c.className) && !c.handwritten && c.extendsQualified !== null) expect(got.has(c.extendsQualified)).toBe(false);
        // Order independence.
        expect(decideClassOmissions([...gateErrors].reverse(), [...withRanges].reverse(), [...linked].reverse())).toEqual(result);
      }),
      fcConfig,
    );
  });
});

const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

function sceneFor(classNames: readonly string[]): SceneJson {
  const symbols: SceneJson["symbols"] = {};
  classNames.forEach((className, i) => {
    symbols[String(i + 1)] = { type: "sprite", className, frameCount: 1, labels: [], frames: [[]] };
  });
  return {
    formatVersion: 1,
    stage: { width: 10, height: 10, backgroundColor: "#ffffff", frameRate: 24 },
    rootSymbolId: 0,
    symbols: { "0": { type: "sprite", frameCount: 1, labels: [], frames: [[]] }, ...symbols },
  } as SceneJson;
}

/** The generator as it was before the omitted set existed. */
function previousRegistry(linked: ReadonlySet<string>, names: readonly string[]): string {
  const used = [...new Set(names)].filter((n) => linked.has(n)).sort();
  const lines = [
    "// Generated by swf-resurrect. Maps linked class names to translated classes.",
    "// Symbols without an entry run as a plain MovieClip.",
  ];
  // Task 5.7: a dotted name imports from its package directory under the binding pkg_Simple.
  const bound = (n: string) => n.replace(/\./g, "_");
  for (const n of used) {
    const simple = n.slice(n.lastIndexOf(".") + 1);
    lines.push(`import { ${bound(n) === simple ? simple : `${simple} as ${bound(n)}`} } from './${n.replace(/\./g, "/")}';`);
  }
  if (used.length === 0) lines.push("export const classRegistry: Record<string, never> = {};");
  else {
    lines.push("", "export const classRegistry = {");
    for (const n of used) lines.push(`  ${JSON.stringify(n)}: ${bound(n)},`);
    lines.push("};");
  }
  return lines.join("\n") + "\n";
}

function registryKeys(text: string): string[] {
  return [...text.matchAll(/^ {2}("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1]) as string);
}

/** **Validates: Requirements 23.3, 23.7, 23.9, 15.5** */
describe("Property 39: The registry and the entries agree with the omitted set", () => {
  it("registers exactly the linked, sourced, not omitted classes; one sorted entry per omitted class", () => {
    fc.assert(
      fc.property(projectArb, ({ gateErrors, classes, linked }) => {
        const omissions = decideClassOmissions(gateErrors, classes, linked);
        const omitted = new Set(omissions.map((o) => o.className));
        const linkedNames = [...new Set(linked.map((s) => s.className))];
        const scene = sceneFor(linkedNames);
        const names = classes.map((c) => c.className);

        const text = buildClassesTs(scene, names, omitted);
        const keys = registryKeys(text);
        const wantKeys = names.filter((n) => linkedNames.includes(n) && !omitted.has(n));
        expect(keys).toEqual([...new Set(wantKeys)].sort());

        // Order independence.
        expect(buildClassesTs(scene, [...names].reverse(), omitted)).toBe(text);
        expect(decideClassOmissions([...gateErrors].reverse(), [...classes].reverse(), [...linked].reverse())).toEqual(omissions);

        // No registered translated class reaches an omitted class.
        for (const c of classes) {
          if (c.handwritten || !keys.includes(c.className)) continue;
          if (c.extendsQualified !== null) expect(omitted.has(c.extendsQualified)).toBe(false);
          for (const i of c.importsQualified) expect(omitted.has(i)).toBe(false);
        }
        for (const o of omitted) expect(text).not.toContain(`{ ${o} }`);

        // Exactly one entry per omitted class, sorted symbol ids.
        expect(new Set(omissions.map((o) => o.className)).size).toBe(omissions.length);
        for (const o of omissions) {
          const ids = linked.filter((s) => s.className === o.className).map((s) => s.symbolId);
          expect(o.symbolIds).toEqual([...ids].sort((a, b) => a - b));
        }

        // A Loose_Class has no entry.
        for (const l of looseClasses(gateErrors, classes, omissions)) expect(omitted.has(l.className)).toBe(false);

        // An empty result gives the previous generator's text.
        if (omissions.length === 0) {
          expect(text).toBe(previousRegistry(new Set(linkedNames), names));
        }
      }),
      fcConfig,
    );
  });

  it("an empty omitted set gives the previous generator's text for any names", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom("A", "B", "C", "pk.D", "E"), { maxLength: 5 }), fc.subarray(["A", "B", "C", "pk.D", "E"]), (names, link) => {
        const scene = sceneFor(link);
        expect(buildClassesTs(scene, names, new Set())).toBe(buildClassesTs(scene, names));
        expect(buildClassesTs(scene, names)).toBe(previousRegistry(new Set(link), names));
      }),
      fcConfig,
    );
  });
});