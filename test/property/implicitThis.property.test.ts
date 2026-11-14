import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { collectFunctionLocals, resolveIdentifier } from "../../src/translate/implicitThis";
import type { ResolveEnv } from "../../src/translate/implicitThis";
import { buildMemberTables, lookupInstance, lookupMember } from "../../src/translate/memberTables";
import { planTranslate } from "../../src/translate/planTranslate";
import { scan } from "../../src/translate/scanner";
import { tokenize } from "../../src/translate/tokenizer";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { fcConfig } from "./config";
import { fileFromSource, genChainCase, genFieldFormCase, genMethodValueCase } from "./gen/genClassContext";
import { evalTranslated } from "../support/evalTranslated";

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

// ---- wiring properties (8.5) ---------------------------------------------------------------

const scene = (names: string[]) =>
  ({
    formatVersion: 1,
    rootSymbolId: 0,
    symbols: Object.fromEntries(names.map((c, i) => [String(i), { type: "sprite", frames: [], labels: {}, className: c }])),
  }) as never;

/** Classes p0.K0 extends p1.K1 ... extends Sprite; the class at `declaring` declares `static var zzS`; K0 reads it bare. */
function staticChain(length: number, declaring: number): Array<{ className: string; source: string }> {
  return Array.from({ length }, (_, i) => {
    const last = i + 1 === length;
    const imp = last ? "import flash.display.Sprite;" : `import p${i + 1}.K${i + 1};`;
    const base = last ? "Sprite" : `K${i + 1}`;
    const own = i === declaring ? "public static var zzS:int;" : "";
    const body = i === 0 ? "public function f():int { return zzS; }" : "";
    return {
      className: `p${i}.K${i}`,
      source: `package p${i} {\n${imp}\npublic class K${i} extends ${base} { ${own} ${body} }\n}\n`,
    };
  });
}

const run = (sources: Array<{ className: string; source: string }>, link = "p0.K0") =>
  planTranslate(sources, scene([link]), tsSyntaxCheck);

describe("Property 35: The resolution is deterministic and independent of file order", () => {
  /** **Validates: Requirements 22.8, 22.9** */
  it("the same sources in any order give the same text, diagnostics and imports", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(3), fc.nat(), (length, d, seed) => {
        const sources = staticChain(length, d % length);
        const shuffled = [...sources].sort((a, b) => ((a.className.length * 31 + seed) % 7) - ((b.className.length * 17 + seed) % 7) || (a.className < b.className ? 1 : -1));
        const a = run(sources).classes;
        const b = run(shuffled).classes;
        expect(b).toEqual(a);
        expect(run(sources).classes).toEqual(a);
      }),
      fcConfig,
    );
  }, 30_000);
});

describe("Property 36: Agreement with the previous call rule", () => {
  /** Reference model of the old rule: `name(` is qualified when name is an own non-static method or a MovieClip member, and not a local. */
  const OLD_SHIM = ["play", "stop", "gotoAndPlay", "gotoAndStop", "addEventListener", "removeEventListener", "addChild", "getChildByName"];
  const OWN = ["alpha1", "beta2", "gamma3"];
  /** **Validates: Requirements 22.7** */
  it("a bare call is `this.name(` exactly when the old rule qualified it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...OLD_SHIM, ...OWN, "loc1", "loc2"), { minLength: 1, maxLength: 6 }),
        fc.subarray(["loc1", "loc2", ...OLD_SHIM.slice(0, 2), ...OWN.slice(0, 1)]),
        (calls, locals) => {
          const decls = locals.map((l) => `var ${l}:Function;`).join(" ");
          const methods = OWN.map((m) => `public function ${m}():void { }`).join("\n");
          const src = `package {\npublic class A extends MovieClip {\n${methods}\npublic function f():void { ${decls}\n${calls.map((c) => `${c}();`).join("\n")} }\n}\n}\n`;
          const text = run([{ className: "A", source: `package { import flash.display.MovieClip;\n${src.slice(src.indexOf("public class"))}` }], "A").classes[0]!.text;
          const lines = text.split("\n").map((l) => l.trim());
          for (const c of calls) {
            const qualified = (OLD_SHIM.includes(c) || OWN.includes(c)) && !locals.includes(c);
            expect(lines.includes(`${qualified ? "this." : ""}${c}();`), c).toBe(true);
          }
        },
      ),
      fcConfig,
    );
  }, 30_000);
});

describe("Property 43: Inherited statics resolve to the declaring class and import it", () => {
  /** **Validates: Requirements 22.1, 22.6** */
  it("Declaring.x with exactly one import of Declaring, whatever the file order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), fc.nat(4), (length, d) => {
        const declaring = 1 + (d % (length - 1));
        const sources = staticChain(length, declaring);
        const c = run(sources).classes.find((x) => x.className === "p0.K0")!;
        expect(c.text).toContain(`return K${declaring}.zzS;`);
        expect(c.importRecords.filter((r) => r.kind === "class" && r.target === `p${declaring}.K${declaring}`)).toHaveLength(1);
        expect(c.diagnostics.filter((x) => x.kind === "unresolved-identifier")).toEqual([]);
        expect(run([...sources].reverse()).classes.find((x) => x.className === "p0.K0")).toEqual(c);
      }),
      fcConfig,
    );
  }, 30_000);

  it("uses the alias of the plan when the simple name is taken", () => {
    const sources = [
      { className: "p0.K0", source: "package p0 {\nimport p1.K1;\npublic class K0 extends K1 { public var other:K2; public function f():int { return zzS; } }\n}\n" },
      { className: "p1.K1", source: "package p1 {\nimport q.K2;\npublic class K1 extends K2 { }\n}\n" },
      { className: "q.K2", source: "package q {\nimport flash.display.Sprite;\npublic class K2 extends Sprite { public static var zzS:int; }\n}\n" },
      { className: "p0.K2", source: "package p0 {\npublic class K2 { }\n}\n" },
    ];
    const c = run(sources).classes.find((x) => x.className === "p0.K0")!;
    expect(c.text).toContain("return q_K2.zzS;");
    expect(c.text).toContain("import { K2 as q_K2 } from");
  }, 30_000);
});

describe("Property 44: Method values are bound once, after super, in declaration order", () => {
  /** **Validates: Requirements 22.8, 22.13** */
  it("one bind per instance method used as a value, own methods first then the nearest base, after super", () => {
    fc.assert(
      fc.property(genMethodValueCase, (c) => {
        const text = run(c.sources, "C0").classes.find((x) => x.className === "C0")!.text;
        const lines = text.split("\n").map((l) => l.trim());
        const found = lines
          .map((l) => /^this\.(\w+) = this\.\1\.bind\(this\);$/.exec(l)?.[1])
          .filter((n): n is string => n !== undefined);
        expect(found).toEqual(c.expected);
        // Static, field, accessor and Shim members are never bound.
        for (const n of ["fld", "acc", "sm", "play"]) expect(found).not.toContain(n);
        if (c.expected.length === 0) {
          expect(text).not.toContain("constructor(");
        } else {
          expect(text.match(/constructor\(/g)).toHaveLength(1);
          const ctor = lines.findIndex((l) => l.includes("constructor("));
          const first = lines.findIndex((l) => l.includes(".bind(this);"));
          // super(...) is the single line between the head and the first bind when the class has a base.
          expect(first - ctor).toBe(c.hasBase ? 2 : 1);
          if (c.hasBase) expect(lines[ctor + 1]).toMatch(/^super\(/);
        }
        expect(run(c.sources, "C0").classes.find((x) => x.className === "C0")!.text).toBe(text);
      }),
      fcConfig,
    );
  }, 30_000);
});

describe("Property 46: A field initialiser sees the bound methods, and the bound function is one reference", () => {
  /** **Validates: Requirements 22.13** */
  it("field form: one bind per method in the first member, none in the constructor; every read is the same function", () => {
    fc.assert(
      fc.property(genFieldFormCase, (c) => {
        const text = run([{ className: "Ticker", source: c.source }], "Ticker").classes.find((x) => x.className === "Ticker")!.text;
        const lines = text.split("\n").map((l) => l.trim());
        const found = lines
          .map((l) => /^this\.(\w+) = this\.\1\.bind\(this\);$/.exec(l)?.[1])
          .filter((n): n is string => n !== undefined);
        expect(found).toEqual(c.expected);
        // The binds sit in the first member, before every other member of the class.
        expect(lines.findIndex((l) => l.startsWith("private readonly __binds_Ticker"))).toBe(1);
        const ctor = lines.findIndex((l) => l.startsWith("public constructor(") || l.startsWith("constructor("));
        if (c.hasCtor) expect(ctor).toBeGreaterThan(lines.findIndex((l) => l === "})();"));
        else expect(ctor).toBe(-1);

        const t = new (evalTranslated(text).Ticker)();
        for (const n of c.inInit) {
          expect(t[`init_${n}`]).toBe(t[n]);
          expect(t[n].call(null)).toBe(t);
        }
        for (const n of c.inCtor) expect(t[`ctor_${n}`]).toBe(t[n]);
        expect(run([{ className: "Ticker", source: c.source }], "Ticker").classes[0]!.text).toBe(text);
      }),
      fcConfig,
    );
  }, 30_000);

  /** **Validates: Requirements 22.13** */
  it("the same source with no initialiser read keeps the constructor form (Property 44 default)", () => {
    fc.assert(
      fc.property(genFieldFormCase, (c) => {
        const src = c.source.replace(/:Function = m\d+;/g, ":Function;");
        const text = run([{ className: "Ticker", source: src }], "Ticker").classes[0]!.text;
        expect(text).not.toContain("__binds_");
        const t = new (evalTranslated(text).Ticker)();
        for (const n of c.inCtor) expect(t[`ctor_${n}`]).toBe(t[n]);
      }),
      fcConfig,
    );
  }, 30_000);
});
