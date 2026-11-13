import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { declareImplements, defineInterface, type AS3InterfaceToken } from "../../template/shim/interfaces";
import { exportedNames } from "../../src/emit/exportedNames";
import { SHIM_AS3_NAMES } from "../../src/translate/shimNames";
import { translate } from "../../src/translate/translate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { fcConfig } from "./config";

// Model: interface i has parents < i (acyclic). Classes form chains; a class implements a set.
interface Graph {
  parents: number[][]; // parents[i] are indices < i
  chain: number[][]; // chain[k] = interfaces declared by class k; class k extends class k-1
}

const genGraph: fc.Arbitrary<Graph> = fc
  .integer({ min: 1, max: 6 })
  .chain((n) => {
    const parents = fc.tuple(...Array.from({ length: n }, (_, i) => (i === 0 ? fc.constant<number[]>([]) : fc.uniqueArray(fc.integer({ min: 0, max: i - 1 }), { maxLength: 3 }))));
    const chain = fc.array(fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), { maxLength: 3 }), { minLength: 1, maxLength: 4 });
    return fc.record({ parents, chain });
  });

function closure(parents: number[][], start: number, out = new Set<number>()): Set<number> {
  if (out.has(start)) return out;
  out.add(start);
  for (const p of parents[start]) closure(parents, p, out);
  return out;
}

describe("interfaces property", () => {
  /**
   * **Feature: breadth, Property 50: `instanceof` against an interface follows the declared closure**
   * **Validates: Requirements 27.4, 27.10, 27.11, 27.12, 27.13**
   */
  it("agrees with the model that closes implements over class and interface inheritance", () => {
    fc.assert(
      fc.property(genGraph, ({ parents, chain }) => {
        const tokens: AS3InterfaceToken[] = [];
        parents.forEach((ps, i) => tokens.push(defineInterface(`p.I${i}`, ps.map((p) => tokens[p]))));
        const classes: Function[] = [];
        chain.forEach((decl, k) => {
          const base = k === 0 ? Object : classes[k - 1];
          const cls = class extends (base as new () => object) {};
          if (decl.length > 0) declareImplements(cls, ...decl.map((d) => tokens[d]));
          classes.push(cls);
        });
        chain.forEach((_, k) => {
          const instance = new (classes[k] as new () => object)();
          const expected = new Set<number>();
          for (let j = 0; j <= k; j++) for (const d of chain[j]) closure(parents, d, expected);
          tokens.forEach((t, i) => expect(instance instanceof t).toBe(expected.has(i)));
        });
      }),
      fcConfig,
    );
  });
});

describe("interfaces examples", () => {
  const I = defineInterface("a.I");
  const J = defineInterface("a.J", [I]);
  const K = defineInterface("a.K", [J]);

  it("is false for null, undefined and primitives", () => {
    for (const v of [null, undefined, 0, "s", true, Symbol("x")] as unknown as object[]) expect(v instanceof I).toBe(false);
  });

  it("a subclass of an implementing class passes without declaring anything (27.11)", () => {
    class Base {}
    declareImplements(Base, I);
    class Sub extends Base {}
    class SubSub extends Sub {}
    expect(new Sub() instanceof I).toBe(true);
    expect(new SubSub() instanceof I).toBe(true);
    expect(new (class {})() instanceof I).toBe(false);
  });

  it("an implementer of a child interface passes for the child and the parents (27.12)", () => {
    class C {}
    declareImplements(C, K);
    const c = new C();
    expect(c instanceof K).toBe(true);
    expect(c instanceof J).toBe(true);
    expect(c instanceof I).toBe(true);
    class D {}
    declareImplements(D, I);
    expect(new D() instanceof J).toBe(false);
  });

  it("a class with several interfaces passes for each (27.13)", () => {
    const A = defineInterface("a.A");
    const B = defineInterface("a.B");
    const C3 = defineInterface("a.C3");
    class X {}
    declareImplements(X, A, B, C3);
    const x = new X();
    expect([x instanceof A, x instanceof B, x instanceof C3]).toEqual([true, true, true]);
  });

  it("a base and a subclass with different interfaces pass for the union (27.13)", () => {
    const A = defineInterface("a.A2");
    const B = defineInterface("a.B2");
    class Base {}
    declareImplements(Base, A);
    class Sub extends Base {}
    declareImplements(Sub, B);
    declareImplements(Sub, I);
    const s = new Sub();
    expect([s instanceof A, s instanceof B, s instanceof I]).toEqual([true, true, true]);
    expect(new Base() instanceof B).toBe(false);
  });

  it("does not read class names: a replaced constructor.name changes nothing (27.4)", () => {
    class Impl {}
    declareImplements(Impl, I);
    Object.defineProperty(Impl, "name", { value: "a" });
    class Other {}
    Object.defineProperty(Other, "name", { value: "Impl" });
    expect(new Impl() instanceof I).toBe(true);
    expect(new Other() instanceof I).toBe(false);
  });

  it("terminates on a cyclic parents list", () => {
    const parents: AS3InterfaceToken[] = [];
    const P = defineInterface("a.P", parents);
    const Q = defineInterface("a.Q", [P]);
    parents.push(Q);
    class Z {}
    declareImplements(Z, Q);
    const Never = defineInterface("a.Never");
    expect(new Z() instanceof P).toBe(true);
    expect(new Z() instanceof Never).toBe(false);
  });
});
describe("interfaces property, translator part", () => {
  const types = ["int", "uint", "Number", "String", "Boolean", "Object", "void"];
  const genMember = fc.record({
    kind: fc.constantFrom("method", "getter", "pair"),
    type: fc.constantFrom(...types.filter((x) => x !== "void")),
    ret: fc.constantFrom(...types),
    params: fc.array(fc.record({ type: fc.constantFrom("int", "String", "Boolean"), dflt: fc.boolean() }), { maxLength: 3 }),
  });
  const genSource = fc.record({ members: fc.array(genMember, { minLength: 0, maxLength: 6 }), parents: fc.uniqueArray(fc.constantFrom("IA", "IB", "IC"), { maxLength: 3 }) });

  /**
   * **Feature: breadth, Property 50: `instanceof` against an interface follows the declared closure**
   * **Validates: Requirements 27.1, 27.7, 27.10**
   */
  it("a generated interface exports the interface and its token, with no diagnostic", () => {
    fc.assert(
      fc.property(genSource, ({ members, parents }) => {
        const lines = members.map((m, i) => {
          if (m.kind === "getter") return `function get g${i}() : ${m.type};`;
          if (m.kind === "pair") return `function get p${i}() : ${m.type};\n      function set p${i}(v:${m.type}) : void;`;
          // an optional parameter cannot be followed by a required one in AS3: defaults only from the first default on
          let seenDefault = false;
          const ps = m.params.map((p, k) => {
            seenDefault = seenDefault || p.dflt;
            return `a${k}:${p.type}${seenDefault ? (p.type === "String" ? ' = "x"' : p.type === "Boolean" ? " = false" : " = 0") : ""}`;
          });
          return `function m${i}(${ps.join(", ")}) : ${m.ret};`;
        });
        const ext = parents.length === 0 ? "" : ` extends ${parents.join(", ")}`;
        const source = `package p\n{\n   public interface IThing${ext}\n   {\n      ${lines.join("\n      ")}\n   }\n}\n`;
        const known = new Set(["p.IThing", ...parents.map((x) => `p.${x}`)]);
        const r = translate(source, { shimNames: SHIM_AS3_NAMES, selfQualified: "p.IThing", siblingClasses: known, syntaxCheck: tsSyntaxCheck });
        expect(r.diagnostics).toEqual([]);
        expect(r.interfaceTranslated).toBe(true);
        expect(exportedNames(r.text)).toEqual(new Set(["IThing"]));
        expect(r.text).toContain(`defineInterface<IThing>('p.IThing', [${parents.join(", ")}]);`);
        members.forEach((m, i) => expect(r.text).toContain(m.kind === "method" ? `m${i}(` : m.kind === "getter" ? `readonly g${i}: ` : `  p${i}: `));
      }),
      fcConfig,
    );
  });
});