import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decideClassOmissions, isEmittedSpecifier, looseClasses } from "../../src/emit/classOmissions";
import { projectArb } from "./gen/genOmissions";
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
          if (cannotLoad) expected.add(c.className);
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
