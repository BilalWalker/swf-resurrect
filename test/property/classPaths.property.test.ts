// Spec tasks 5.6 and 5.7.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildBindings, planClassPaths, resolveImportLines } from "../../src/emit/classPaths";
import type { ImportRecord } from "../../src/translate/types";
import { fcConfig } from "./config";
import { P11_RESERVED, genClassNameSet } from "./gen/genClassNames";

const lower = (s: string) => s.toLowerCase();

describe("Property 11: Class paths are unique, deterministic and stable over package trees", () => {
  it("**Validates: Requirements 6.1, 6.2, 6.5, 18.7** unique lower-cased paths, no clash with reserved paths or directories", () => {
    fc.assert(
      fc.property(genClassNameSet, (names) => {
        const plan = planClassPaths(names, P11_RESERVED);
        expect(plan.map((p) => p.className)).toEqual([...names].sort());
        const files = plan.map((p) => lower(p.path));
        expect(new Set(files).size).toBe(files.length);
        for (const r of P11_RESERVED) expect(files).not.toContain(lower(r));
        // No chosen file path equals a directory path of another class or of a reserved path.
        const dirs = new Set<string>();
        for (const p of [...plan.map((x) => x.path), ...P11_RESERVED]) {
          const segs = lower(p).split("/");
          for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join("/"));
        }
        for (const f of files) expect(dirs.has(f)).toBe(false);
        for (const p of plan) {
          expect(p.path.split("/").length).toBe(p.originalPath.split("/").length);
          expect(p.renamed).toBe(p.path !== p.originalPath);
        }
      }),
      fcConfig,
    );
  });

  it("is independent of the order of the names and repeatable", () => {
    fc.assert(
      fc.property(genClassNameSet, fc.nat(), (names, seed) => {
        const k = names.length === 0 ? 0 : seed % names.length;
        const rotated = [...names.slice(k), ...names.slice(0, k)].reverse();
        expect(planClassPaths(rotated, [...P11_RESERVED].reverse())).toEqual(planClassPaths(names, P11_RESERVED));
      }),
      fcConfig,
    );
  });

  it("changes only colliding segments: a class whose lower-cased canonical path is unique and unreserved keeps it", () => {
    fc.assert(
      fc.property(genClassNameSet, (names) => {
        const plan = planClassPaths(names, P11_RESERVED);
        const count = new Map<string, number>();
        for (const p of plan) count.set(lower(p.originalPath), (count.get(lower(p.originalPath)) ?? 0) + 1);
        const prefixes = new Set<string>();
        for (const p of plan) {
          const segs = lower(p.originalPath).split("/");
          for (let i = 1; i < segs.length; i++) prefixes.add(segs.slice(0, i + 1).join("/"));
        }
        for (const p of plan) {
          const segs = lower(p.originalPath).split("/");
          // A directory spelled like a generated "_class" name can be displaced by a renamed sibling.
          let clean = !segs.some((s) => s.endsWith("_class")) && count.get(lower(p.originalPath)) === 1 && !P11_RESERVED.some((r) => lower(r) === lower(p.originalPath));
          // case variants of any directory on the way
          for (let i = 1; i < segs.length - 1; i++) {
            const spellings = new Set(plan.filter((q) => lower(q.originalPath).startsWith(segs.slice(0, i + 1).join("/") + "/")).map((q) => q.originalPath.split("/")[i]));
            if (spellings.size > 1) clean = false;
          }
          if (clean) expect(p.path).toBe(p.originalPath);
        }
      }),
      fcConfig,
    );
  });
});

describe("planClassPaths examples", () => {
  it("moves Main next to the Boot_File and keeps other unnamed-package classes", () => {
    const plan = planClassPaths(["Main", "Ball"], ["src/main.ts"]);
    expect(plan.map((p) => p.path)).toEqual(["src/Ball.ts", "src/Main.class.ts"]);
  });
  it("renames the later spelling of a case-only directory pair", () => {
    const plan = planClassPaths(["foo.A", "Foo.B"], []);
    expect(plan.map((p) => p.path)).toEqual(["src/Foo/B.ts", "src/foo_class/A.ts"]);
  });
  it("numbers repeated file collisions", () => {
    const plan = planClassPaths(["Main", "main", "MAIN"], ["src/main.ts"]);
    expect(plan.map((p) => p.path).sort()).toEqual(["src/MAIN.class.ts", "src/Main.class2.ts", "src/main.class3.ts"]);
  });
});

/** Pure path normaliser: resolves `spec` against the directory of `from` and drops '.' and '..'. */
function resolveSpec(from: string, spec: string): string {
  const out = from.split("/").slice(0, -1);
  for (const s of spec.split("/")) {
    if (s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

/** Every class imports every other class (one record each) and the Shim; line 1 is the Shim. */
function resolveAll(names: readonly string[]): Map<string, string[]> {
  const plan = planClassPaths(names, P11_RESERVED);
  const chosen = new Map(plan.map((p) => [p.className, p.path]));
  const result = new Map<string, string[]>();
  for (const p of plan) {
    const records: ImportRecord[] = [{ line: 1, kind: "shim", names: [{ name: "Sprite" }] }];
    const lines = ["import { Sprite } from 'x';"];
    for (const other of [...names].sort()) {
      if (other === p.className) continue;
      records.push({ line: lines.length + 1, kind: "class", names: [{ name: "X" }], target: other });
      lines.push("import { X } from 'y';");
    }
    const text = [...lines, "const s = \"import { Z } from 'z';\";"].join("\n");
    result.set(p.className, resolveImportLines(text, records, p.path, chosen).split("\n"));
  }
  return result;
}

describe("Property 21: Package-tree paths and import specifiers resolve", () => {
  it("**Validates: Requirements 18.4, 18.6, 18.7, 18.10, 15.5** every import resolves to exactly the chosen path, the Shim to shim", () => {
    fc.assert(
      fc.property(genClassNameSet, (names) => {
        const plan = planClassPaths(names, P11_RESERVED);
        const chosen = new Map(plan.map((p) => [p.className, p.path]));
        const out = resolveAll(names);
        for (const p of plan) {
          const lines = out.get(p.className) as string[];
          const specs = lines.slice(0, -1).map((l) => /from '([^']+)';$/.exec(l)?.[1] as string);
          expect(resolveSpec(p.path, specs[0])).toBe("shim");
          const others = [...names].sort().filter((n) => n !== p.className);
          others.forEach((o, i) => expect(resolveSpec(p.path, specs[i + 1]) + ".ts").toBe(chosen.get(o)));
          // Text that merely looks like an import is untouched.
          expect(lines[lines.length - 1]).toBe("const s = \"import { Z } from 'z';\";");
        }
      }),
      fcConfig,
    );
  });

  it("gives the same result for any order of classes", () => {
    fc.assert(
      fc.property(genClassNameSet, fc.nat(), (names, seed) => {
        const k = names.length === 0 ? 0 : seed % names.length;
        const rotated = [...names.slice(k), ...names.slice(0, k)].reverse();
        expect([...resolveAll(rotated)]).toEqual([...resolveAll(names)]);
      }),
      fcConfig,
    );
  });

  it("keeps aliases and leaves a record without a chosen target unchanged", () => {
    const text = "import { S } from '../shim';\nimport { Slider } from './Slider';\nx";
    const records: ImportRecord[] = [
      { line: 1, kind: "shim", names: [{ name: "S" }] },
      { line: 2, kind: "class", names: [{ name: "Slider", alias: "b_Slider" }], target: "fl.Slider" },
    ];
    expect(resolveImportLines(text, records, "src/a/X.ts", new Map([["fl.Slider", "src/fl_class/Slider.ts"]]))).toBe(
      "import { S } from '../../shim';\nimport { Slider as b_Slider } from '../fl_class/Slider';\nx",
    );
    expect(resolveImportLines(text, records, "src/X.ts", new Map())).toBe("import { S } from '../shim';\nimport { Slider } from './Slider';\nx");
  });
});

describe("Property 23: Registry bindings are unique and keep unnamed names", () => {
  it("**Validates: Requirements 18.8, 15.5** unique bindings, unnamed names kept, order independent", () => {
    fc.assert(
      fc.property(genClassNameSet, fc.nat(), (names, seed) => {
        const b = buildBindings(names);
        expect(new Set(b.values()).size).toBe(names.length);
        expect([...b.keys()].sort()).toEqual([...names].sort());
        for (const n of names) {
          if (!n.includes(".")) expect(b.get(n)).toBe(n);
          else expect(b.get(n)).not.toBe("classRegistry");
          expect(b.get(n)).toMatch(/^[A-Za-z_$][\w$]*$/);
        }
        const k = names.length === 0 ? 0 : seed % names.length;
        const rotated = [...names.slice(k), ...names.slice(0, k)].reverse();
        expect([...buildBindings(rotated)]).toEqual([...b]);
      }),
      fcConfig,
    );
  });

  it("numbers clashes in order", () => {
    const b = buildBindings(["fl.controls.Slider", "fl_controls_Slider", "fl_controls_Slider_2", "x.classRegistry"]);
    expect(b.get("fl_controls_Slider")).toBe("fl_controls_Slider");
    expect(b.get("fl.controls.Slider")).toBe("fl_controls_Slider_3");
    expect(b.get("x.classRegistry")).toBe("x_classRegistry");
  });
});