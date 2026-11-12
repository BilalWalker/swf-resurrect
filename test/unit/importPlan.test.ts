import { describe, expect, it } from "vitest";
import { planFileImports } from "../../src/translate/importPlan";
import type { ImportPlanInput } from "../../src/translate/importPlan";

function input(over: Partial<ImportPlanInput>): ImportPlanInput {
  return {
    selfQualified: "app.Main",
    declared: new Set(["Main"]),
    shimNames: new Set(["Sprite"]),
    known: new Set(),
    imports: [],
    bare: new Map(),
    chains: [],
    ...over,
  };
}

describe("planFileImports forced", () => {
  it("binds a forced target the file does not name, with the simple name", () => {
    const plan = planFileImports(input({ known: new Set(["lib.Base"]), forced: ["lib.Base"] }));
    expect(plan.imports).toEqual([{ target: "lib.Base", binding: "Base", aliased: false }]);
  });

  it("uses an alias when the simple name is taken", () => {
    const plan = planFileImports(
      input({
        known: new Set(["a.X", "b.X"]),
        imports: [{ path: "a.X", wildcard: false }],
        bare: new Map([["X", 3]]),
        forced: ["b.X"],
      }),
    );
    expect(plan.imports).toEqual([
      { target: "a.X", binding: "X", aliased: false },
      { target: "b.X", binding: "b_X", aliased: true },
    ]);
  });

  it("uses an alias when the simple name is a Shim name or declared", () => {
    const plan = planFileImports(input({ known: new Set(["lib.Sprite", "lib.Main"]), forced: ["lib.Sprite", "lib.Main"] }));
    expect(plan.imports.map((p) => p.binding)).toEqual(["lib_Main", "lib_Sprite"]);
  });

  it("changes nothing for a target that is already bound", () => {
    const base = input({ known: new Set(["lib.Base"]), imports: [{ path: "lib.Base", wildcard: false }], bare: new Map([["Base", 2]]) });
    expect(planFileImports({ ...base, forced: ["lib.Base"] })).toEqual(planFileImports(base));
  });

  it("ignores a forced target that is unknown or the file itself", () => {
    const plan = planFileImports(input({ known: new Set(["app.Main"]), forced: ["nope.X", "app.Main"] }));
    expect(plan.imports).toEqual([]);
  });
});

describe("planFileImports scoping", () => {
  it("prefers explicit import over same package over wildcard", () => {
    const known = new Set(["app.X", "b.X", "c.X"]);
    const wild = [{ path: "c", wildcard: true }];
    const bare = new Map([["X", 1]]);
    expect(planFileImports(input({ known, bare, imports: [...wild, { path: "b.X", wildcard: false }] })).bindingOfBare.get("X")).toBe("b.X");
    expect(planFileImports(input({ known, bare, imports: wild })).bindingOfBare.get("X")).toBe("app.X");
    expect(planFileImports(input({ known: new Set(["c.X"]), bare, imports: wild })).bindingOfBare.get("X")).toBe("c.X");
  });

  it("binds neither of two wildcard candidates and names both", () => {
    const plan = planFileImports(
      input({
        known: new Set(["a.X", "b.X"]),
        bare: new Map([["X", 7]]),
        imports: [
          { path: "a", wildcard: true },
          { path: "b", wildcard: true },
        ],
      }),
    );
    expect(plan.imports).toEqual([]);
    expect(plan.diagnostics).toEqual([
      { kind: "unsupported-construct", line: 7, message: '"X" is ambiguous between a.X and b.X; neither is imported' },
    ]);
  });

  it("leaves a Shim name and an unresolved name unbound, and aliases a clashing chain", () => {
    const plan = planFileImports(
      input({
        known: new Set(["a.X", "b.X"]),
        bare: new Map([["Sprite", 1], ["Nope", 2], ["X", 3]]),
        imports: [{ path: "a.X", wildcard: false }],
        chains: [{ text: "b.X", qn: "b.X", line: 4 }],
      }),
    );
    expect(plan.bindingOfBare.size).toBe(1);
    expect(plan.bindingOfChain.get("b.X")).toBe("b_X");
  });
});
