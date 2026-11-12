import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planFileImports } from "../../src/translate/importPlan";
import type { ImportPlanInput } from "../../src/translate/importPlan";
import { fcConfig } from "./config";
import { genImportPlanInput } from "./gen/genClassNames";

const simple = (q: string) => q.slice(q.lastIndexOf(".") + 1);
const pkg = (q: string) => (q.includes(".") ? q.slice(0, q.lastIndexOf(".")) : "");
const join = (p: string, s: string) => (p === "" ? s : `${p}.${s}`);

/** Independent statement of the scoping order: explicit import, same package, wildcard. */
function expectedCandidates(i: ImportPlanInput, name: string): string[] {
  const ok = (q: string) => i.known.has(q) && q !== i.selfQualified;
  const explicit = [...new Set(i.imports.filter((d) => !d.wildcard && simple(d.path) === name && ok(d.path)).map((d) => d.path))];
  if (explicit.length > 0) return explicit.sort();
  if (ok(join(pkg(i.selfQualified), name))) return [join(pkg(i.selfQualified), name)];
  return [...new Set(i.imports.filter((d) => d.wildcard && ok(join(d.path, name))).map((d) => join(d.path, name)))].sort();
}

describe("Property 22: The import plan binds every reference once and reports ambiguity", () => {
  /** **Validates: Requirements 18.4, 18.5, 18.9** */
  it("binds each resolvable bare name once, by the scoping order", () => {
    fc.assert(
      fc.property(genImportPlanInput, (input) => {
        const plan = planFileImports(input);
        for (const [name, line] of input.bare) {
          if (input.declared.has(name)) {
            expect(plan.bindingOfBare.has(name)).toBe(false);
            continue;
          }
          const cands = expectedCandidates(input, name);
          if (cands.length === 1) expect(plan.bindingOfBare.get(name)).toBe(cands[0]);
          else expect(plan.bindingOfBare.has(name)).toBe(false);
          const diag = plan.diagnostics.filter((d) => d.message.startsWith(`"${name}" is ambiguous`));
          if (cands.length > 1) {
            expect(diag).toHaveLength(1);
            expect(diag[0].line).toBe(line);
            for (const c of cands) expect(diag[0].message).toContain(c);
          } else expect(diag).toHaveLength(0);
        }
      }),
      fcConfig,
    );
  });

  it("gives one binding per target, no binding twice, and the simple name unless taken", () => {
    fc.assert(
      fc.property(genImportPlanInput, (input) => {
        const plan = planFileImports(input);
        const bindings = plan.imports.map((p) => p.binding);
        expect(new Set(bindings).size).toBe(bindings.length);
        expect(new Set(plan.imports.map((p) => p.target)).size).toBe(plan.imports.length);
        for (const p of plan.imports) {
          expect(input.declared.has(p.binding)).toBe(false);
          // A class found by scoping beats a Shim name of the same spelling; every other binding avoids it.
          if (!plan.bindingOfBare.has(p.binding)) expect(input.shimNames.has(p.binding)).toBe(false);
          expect(p.aliased).toBe(p.binding !== simple(p.target));
          if (p.aliased) expect(p.binding.startsWith(p.target.split(".").join("_"))).toBe(true);
          else expect(p.binding).toBe(simple(p.target));
        }
        // Every chain and every usable forced target is bound; bare bindings keep the simple name.
        const bound = new Set(plan.imports.map((p) => p.target));
        const usable = (q: string) => input.known.has(q) && q !== input.selfQualified;
        for (const c of input.chains) {
          if (usable(c.qn)) expect(plan.bindingOfChain.get(c.text)).toBe(plan.imports.find((p) => p.target === c.qn)?.binding);
        }
        for (const f of input.forced ?? []) if (usable(f)) expect(bound.has(f)).toBe(true);
        for (const [name, target] of plan.bindingOfBare) {
          expect(plan.imports.find((p) => p.target === target)?.binding).toBe(name);
        }
        // Nothing is imported that no reference asked for.
        const asked = new Set<string>([...plan.bindingOfBare.values()]);
        for (const c of input.chains) if (usable(c.qn)) asked.add(c.qn);
        for (const f of input.forced ?? []) if (usable(f)) asked.add(f);
        expect(bound).toEqual(asked);
      }),
      fcConfig,
    );
  });

  it("is the same for any order of the inputs", () => {
    fc.assert(
      fc.property(genImportPlanInput, fc.nat(), (input, seed) => {
        const rot = <T,>(a: readonly T[]) => (a.length === 0 ? [] : [...a.slice(seed % a.length), ...a.slice(0, seed % a.length)]);
        const shuffled: ImportPlanInput = {
          ...input,
          imports: [...input.imports].reverse(),
          bare: new Map(rot([...input.bare])),
          chains: rot(input.chains),
          forced: rot(input.forced ?? []),
        };
        expect(planFileImports(shuffled)).toEqual(planFileImports(input));
      }),
      fcConfig,
    );
  });
});
