import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { collectFunctionLocals, resolveIdentifier } from "../../src/translate/implicitThis";
import type { ResolveEnv } from "../../src/translate/implicitThis";
import { buildMemberTables, lookupInstance, lookupMember } from "../../src/translate/memberTables";
import { scan } from "../../src/translate/scanner";
import { tokenize } from "../../src/translate/tokenizer";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { fcConfig } from "./config";
import { fileFromSource, genChainCase } from "./gen/genClassContext";

/** Members of a Shim class and its chain with the class that declares each (nearest first). */
function chainMembers(base: string): Array<{ name: string; owner: string }> {
  const out: Array<{ name: string; owner: string }> = [];
  const seen = new Set<string>();
  const taken = new Set<string>();
  for (let cur: string | null = base; cur !== null && !seen.has(cur); cur = SHIM_MEMBER_TABLE[cur]!.extends) {
    seen.add(cur);
    for (const m of SHIM_MEMBER_TABLE[cur]!.members) {
      if (taken.has(m.name)) continue;
      taken.add(m.name);
      out.push({ name: m.name, owner: cur });
    }
  }
  return out;
}

describe("Property 34: Shim members reached through any chain", () => {
  /** **Validates: Requirements 22.1, 22.5, 22.6** */
  it("every member of a Shim class or its chain is found through translated classes that do not declare it", () => {
    fc.assert(
      fc.property(genChainCase, (c) => {
        const t = buildMemberTables(c.files, SHIM_MEMBER_TABLE);
        for (const { name, owner } of chainMembers(c.shimBase)) {
          expect(lookupMember(t, c.start, name)).toMatchObject({ rule: "shim", owner });
          expect(lookupInstance(t, c.start, name)).toMatchObject({ rule: "shim", owner });
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 22.1, 22.5** */
  it("a name in no table is not found, and an own name resolves in the translated class", () => {
    fc.assert(
      fc.property(genChainCase, (c) => {
        const t = buildMemberTables(c.files, SHIM_MEMBER_TABLE);
        expect(lookupMember(t, c.start, "notAnywhereAtAll")).toBeNull();
        for (const n of c.ownNames) expect(lookupMember(t, c.start, n)).not.toBeNull();
      }),
      fcConfig,
    );
  });
});

// ---- resolver properties (8.4) -------------------------------------------------------------

type Decl = "none" | "instance" | "static";
const genDecls = fc.array(fc.constantFrom<Decl>("none", "instance", "static"), { minLength: 1, maxLength: 4 });

/** Classes C0 extends C1 ... extends Sprite, each declaring `zzX` as nothing, an instance field or a static field. */
function chainEnv(decls: Decl[], isStatic: boolean, locals: string[] = []): ResolveEnv {
  const files = decls.map((d, i) => {
    const base = i + 1 < decls.length ? `C${i + 1}` : "Sprite";
    const imp = i + 1 < decls.length ? "" : "import flash.display.Sprite;\n";
    const member = d === "none" ? "" : `public ${d === "static" ? "static " : ""}var zzX:int;`;
    return fileFromSource(`C${i}`, `package {\n${imp}public class C${i} extends ${base} { ${member} }\n}\n`);
  });
  return {
    tables: buildMemberTables(files, SHIM_MEMBER_TABLE),
    self: "C0",
    className: "C0",
    isStatic,
    locals: new Set(locals),
    classNames: new Set(),
    bindingOf: (q) => q,
  };
}

describe("Property 30: Bare identifiers resolve by the rules, in order, along one walk of the chain", () => {
  /** **Validates: Requirements 22.1, 22.6** */
  it("the nearest declaring class decides, and its instance member wins over its static", () => {
    fc.assert(
      fc.property(genDecls, (decls) => {
        const r = resolveIdentifier("zzX", 3, chainEnv(decls, false));
        const idx = decls.findIndex((d) => d !== "none");
        if (idx < 0) {
          expect(r.kind).toBe("diagnose");
        } else if (decls[idx] === "instance") {
          expect(r).toMatchObject({ kind: "rewrite", text: "this.zzX", importTarget: null });
        } else if (idx === 0) {
          expect(r).toMatchObject({ kind: "rewrite", text: "C0.zzX", importTarget: null });
        } else {
          expect(r).toMatchObject({ kind: "rewrite", text: `C${idx}.zzX`, importTarget: `C${idx}` });
        }
      }),
      fcConfig,
    );
  });
});

describe("Property 31: Locals shadow every member", () => {
  /** **Validates: Requirements 22.3** */
  it("a local named like a member, a Shim member or a global is left alone", () => {
    fc.assert(
      fc.property(genDecls, fc.constantFrom("zzX", "x", "stage", "Math", "play"), fc.boolean(), (decls, name, isStatic) => {
        expect(resolveIdentifier(name, 1, chainEnv(decls, isStatic, [name]))).toEqual({ kind: "leave", why: "local" });
      }),
      fcConfig,
    );
  });
});

describe("Property 32: Declarations hoist to function scope", () => {
  /** **Validates: Requirements 22.3** */
  it("every var or const in nested blocks, for and for-in is a local of the whole function", () => {
    const genName = fc.constantFrom("a", "b", "c", "d", "e");
    fc.assert(
      fc.property(fc.uniqueArray(genName, { minLength: 4, maxLength: 5 }), fc.constantFrom("p", "q"), (names, param) => {
        const [a, b, c, d] = names as [string, string, string, string];
        const src =
          `package { public class K { public function f(${param}:int):void {\n` +
          `  if (${param}) { var ${a}:int = 1; } else { const ${b}:int = 2; }\n` +
          `  for (var ${c}:int = 0; ${c} < 3; ${c}++) { while (true) { var ${d}:int; } }\n` +
          `  for (var k in ${param}) { }\n} } }`;
        const cls = scan(tokenize(src)).nodes.flatMap((n) => (n.kind === "package" ? n.body : [n])).find((n) => n.kind === "class");
        const fn = cls?.kind === "class" ? cls.body.nodes.find((n) => n.kind === "method") : undefined;
        if (fn?.kind !== "method") throw new Error("no method");
        const locals = collectFunctionLocals(fn.params, fn.body.nodes);
        for (const n of [param, a, b, c, d, "k"]) expect(locals.has(n), n).toBe(true);
      }),
      fcConfig,
    );
  });
});

describe("Property 33: Static and instance contexts", () => {
  /** **Validates: Requirements 22.4** */
  it("a static context sees statics only; an instance-only member gives the static-context message", () => {
    fc.assert(
      fc.property(genDecls, (decls) => {
        const inst = resolveIdentifier("zzX", 1, chainEnv(decls, true));
        if (decls.includes("static")) {
          expect(inst.kind).toBe("rewrite");
        } else if (decls.includes("instance")) {
          expect(inst).toMatchObject({ kind: "diagnose" });
          if (inst.kind === "diagnose") expect(inst.diagnostic.message).toContain("static context");
        } else {
          if (inst.kind === "diagnose") expect(inst.diagnostic.message).not.toContain("static context");
        }
      }),
      fcConfig,
    );
  });
});
