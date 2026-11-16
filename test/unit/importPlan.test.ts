import { describe, expect, it } from "vitest";
import { planFileImports } from "../../src/translate/importPlan";
import type { ImportPlanInput } from "../../src/translate/importPlan";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { translate } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";

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

describe("planFileImports root package", () => {
  const bare = new Map([["Test", 1]]);
  it("binds a root-package class named without an import from a named package", () => {
    const plan = planFileImports(input({ known: new Set(["Test"]), bare }));
    expect(plan.bindingOfBare.get("Test")).toBe("Test");
    expect(plan.imports).toEqual([{ target: "Test", binding: "Test", aliased: false }]);
  });

  it("prefers a same-package class over the root-package class", () => {
    const plan = planFileImports(input({ known: new Set(["Test", "app.Test"]), bare }));
    expect(plan.bindingOfBare.get("Test")).toBe("app.Test");
  });

  it("binds a root-package class from a root-package file (same-package rule)", () => {
    const plan = planFileImports(input({ selfQualified: "Main", known: new Set(["Test"]), bare }));
    expect(plan.bindingOfBare.get("Test")).toBe("Test");
  });
});

describe("planFileImports root package precedence", () => {
  const bare = new Map([["Test", 1]]);
  const known = new Set(["Test", "app.Test", "lib.Test", "w.Test"]);
  it("an explicit import wins over the root package", () => {
    const plan = planFileImports(input({ known: new Set(["Test", "lib.Test"]), bare, imports: [{ path: "lib.Test", wildcard: false }] }));
    expect(plan.bindingOfBare.get("Test")).toBe("lib.Test");
  });
  it("a same-package class wins over the root package", () => {
    expect(planFileImports(input({ known, bare })).bindingOfBare.get("Test")).toBe("app.Test");
  });
  it("a wildcard import wins over the root package", () => {
    const plan = planFileImports(input({ known: new Set(["Test", "w.Test"]), bare, imports: [{ path: "w", wildcard: true }] }));
    expect(plan.bindingOfBare.get("Test")).toBe("w.Test");
  });
  it("an explicit import wins over same package, wildcard and root package together", () => {
    const plan = planFileImports(input({ known, bare, imports: [{ path: "w", wildcard: true }, { path: "lib.Test", wildcard: false }] }));
    expect(plan.bindingOfBare.get("Test")).toBe("lib.Test");
  });
  it("a root-package name resolves from a nested package only when nothing else matches", () => {
    const plan = planFileImports(input({ selfQualified: "a.b.C", declared: new Set(["C"]), known: new Set(["Test", "a.b.C"]), bare }));
    expect(plan.bindingOfBare.get("Test")).toBe("Test");
  });
  it("a nested-package file with a same-named class in its own package takes that one", () => {
    const plan = planFileImports(input({ selfQualified: "a.b.C", declared: new Set(["C"]), known: new Set(["Test", "a.b.Test", "a.b.C"]), bare }));
    expect(plan.bindingOfBare.get("Test")).toBe("a.b.Test");
  });
  it("leaves the name unbound when no level has the class", () => {
    const plan = planFileImports(input({ known: new Set(["lib.Test"]), bare }));
    expect(plan.bindingOfBare.has("Test")).toBe(false);
  });
});

describe("Shim classes in type positions are imported (Requirements 2.1, 2.2, 2.5)", () => {
  const importLines = (members: string): string[] => {
    const r = translate(`package p { public class C { ${members} } }`, {
      shimNames: SHIM_AS3_NAMES,
      selfQualified: "p.C",
      siblingClasses: new Set(["p.C"]) as never,
      syntaxCheck: tsSyntaxCheck,
    });
    return r.text.split("\n").filter((l) => l.startsWith("import "));
  };
  const stageImports = (members: string): string[] => importLines(members).filter((l) => /\bStage\b/.test(l));

  it("a field type only", () => {
    expect(stageImports("private var s:Stage;")).toHaveLength(1);
  });
  it("a local variable type only", () => {
    expect(stageImports("public function f():void { var s:Stage; }")).toHaveLength(1);
  });
  it("a parameter type only", () => {
    expect(stageImports("public function f(s:Stage):void { }")).toHaveLength(1);
  });
  it("a return type only", () => {
    expect(stageImports("public function f():Stage { return null; }")).toHaveLength(1);
  });
  it("an as cast type only", () => {
    expect(stageImports("public function f(o:Object):void { var x:* = o as Stage; }")).toHaveLength(1);
  });
  it("a type and an expression give one import of the name", () => {
    expect(stageImports("public function f(s:Stage):void { var c:* = Stage; }")).toHaveLength(1);
  });
});
