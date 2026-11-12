// Spec task 5.6.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planClassPaths } from "../../src/emit/classPaths";
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
