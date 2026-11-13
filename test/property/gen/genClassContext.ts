import fc from "fast-check";
import type { FileForTables } from "../../../src/translate/memberTables";
import { scan } from "../../../src/translate/scanner";
import { SHIM_MEMBER_TABLE } from "../../../src/translate/shimMembers.generated";
import { tokenize } from "../../../src/translate/tokenizer";

/** Source text of one AS3 file scanned into the nodes `buildMemberTables` takes. */
export function fileFromSource(qualified: string, source: string): FileForTables {
  return { qualified, nodes: scan(tokenize(source)).nodes };
}

export interface ChainCase {
  /** Translated classes, subclass first; the last one extends `shimBase`. */
  files: FileForTables[];
  /** Qualified_Name of the first class. */
  start: string;
  shimBase: string;
  /** Names declared by the translated classes (never a Shim member name). */
  ownNames: string[];
}

const shimBases = Object.keys(SHIM_MEMBER_TABLE).sort();
const genOwnName = fc.constantFrom("zzA", "zzB", "zzC", "zzD", "zzE");

/** A chain of 1 to 4 translated classes (the class itself plus 0 to 3 between it and the Shim) across packages, ending at a Shim class. Own names never collide with Shim members. */
export const genChainCase: fc.Arbitrary<ChainCase> = fc
  .record({
    shimBase: fc.constantFrom(...shimBases),
    length: fc.integer({ min: 1, max: 4 }),
    pkgs: fc.array(fc.constantFrom("", "a", "a.b"), { minLength: 4, maxLength: 4 }),
    owns: fc.array(fc.uniqueArray(genOwnName, { maxLength: 3 }), { minLength: 4, maxLength: 4 }),
  })
  .map(({ shimBase, length, pkgs, owns }) => {
    const qualifieds = Array.from({ length }, (_, i) => (pkgs[i] === "" ? `C${i}` : `${pkgs[i]}.C${i}`));
    const files = qualifieds.map((q, i) => {
      const pkg = pkgs[i]!;
      const base = i + 1 < length ? qualifieds[i + 1]! : shimBase;
      const imports = i + 1 < length ? `import ${base};\n` : "";
      const importShim = i + 1 === length ? `import flash.display.${shimBase};\n` : "";
      const members = owns[i]!.map((n) => `    public var ${n}:int;`).join("\n");
      const text = `package ${pkg} {\n${imports}${importShim}  public class C${i} extends ${base.slice(base.lastIndexOf(".") + 1)} {\n${members}\n  }\n}\n`;
      return fileFromSource(q, text);
    });
    return { files, start: qualifieds[0] ?? "", shimBase, ownNames: owns.slice(0, length).flat() };
  });

export interface MethodValueCase {
  /** Classes C0 (the one under test) to C{n-1}, ending at Sprite. */
  sources: Array<{ className: string; source: string }>;
  /** Names C0 binds, in the order the declaration rule gives. */
  expected: string[];
  hasBase: boolean;
}

const methodPool = ["mA", "mB", "mC", "mD", "mE"] as const;
type UseMode = "value" | "this" | "call" | "none";

/**
 * A chain of 1 to 3 translated classes. Each declares a subset of the method pool in a generated order (a name may be
 * declared by several classes). C0 has no constructor and one method `f` that uses every declared name as a value,
 * as `this.name`, as a call, or not at all, plus a field, an accessor, a static method and a Shim member as values.
 */
export const genMethodValueCase: fc.Arbitrary<MethodValueCase> = fc
  .record({
    length: fc.integer({ min: 1, max: 3 }),
    decls: fc.array(fc.shuffledSubarray([...methodPool]), { minLength: 3, maxLength: 3 }),
    modes: fc.array(fc.constantFrom<UseMode>("value", "this", "call", "none"), { minLength: 5, maxLength: 5 }),
    order: fc.shuffledSubarray([...methodPool], { minLength: 5, maxLength: 5 }),
  })
  .map(({ length, decls, modes, order }) => {
    const declared = decls.slice(0, length);
    const modeOf = new Map(methodPool.map((n, i) => [n, modes[i]!] as const));
    const sources = declared.map((names, i) => {
      const last = i + 1 === length;
      const imp = last ? "import flash.display.Sprite;\n" : "";
      const base = last ? "Sprite" : `C${i + 1}`;
      const methods = names.map((n) => `public function ${n}():void {}`).join("\n");
      const extra =
        i === 0
          ? "public var fld:int;\npublic function get acc():int { return 1; }\npublic static function sm():void {}"
          : "";
      let body = "";
      if (i === 0) {
        const all = new Set(declared.flat());
        const uses = order
          .filter((n) => all.has(n))
          .map((n) => {
            const m = modeOf.get(n)!;
            return m === "value" ? `g(${n});` : m === "this" ? `g(this.${n});` : m === "call" ? `${n}();` : "";
          });
        body = `public function f():void { var g:Function = null; ${uses.join(" ")} g(fld); g(acc); g(sm); g(play); }`;
      }
      return {
        className: `C${i}`,
        source: `package {\n${imp}public class C${i} extends ${base} {\n${extra}\n${methods}\n${body}\n}\n}\n`,
      };
    });
    // Expected: chain walk, each class's declaration order, a name placed by the nearest class only.
    const wanted = new Set(methodPool.filter((n) => modeOf.get(n) === "value" || modeOf.get(n) === "this"));
    const expected: string[] = [];
    for (const names of declared) for (const n of names) if (wanted.has(n) && !expected.includes(n)) expected.push(n);
    return { sources, expected, hasBase: true };
  });

export interface DottedAnnotationCase {
  /** AS3 source of `app.Main` with one dotted annotation per position. */
  source: string;
  /** Qualified_Names that have a source, in generated order (shuffled by the test). */
  known: string[];
  /** The annotation text each position must produce: the binding, or the dotted name when it has no source. */
  expected: string[];
  /** Dotted names of the annotations that have a source. */
  resolved: string[];
}

const dottedPool = ["lib.util.Helper", "lib.core.Core", "x.y.z.Deep", "other.Thing"] as const;
const dottedUnknown = ["no.such.Thing", "gone.pkg.Lost"] as const;

/**
 * A class `app.Main` whose variable, parameter, return and field annotations (and a `Vector.<T>` element) are dotted
 * names, some with a source and some without. Pool simple names are unique, so a resolved annotation is its simple name.
 */
export const genDottedAnnotationCase: fc.Arbitrary<DottedAnnotationCase> = fc
  .record({
    names: fc.array(fc.constantFrom<string>(...dottedPool, ...dottedUnknown), { minLength: 5, maxLength: 5 }),
    known: fc.shuffledSubarray([...dottedPool], { minLength: 0 }),
  })
  .map(({ names, known }) => {
    const knownSet = new Set<string>(known);
    const out = (n: string): string => (knownSet.has(n) ? n.slice(n.lastIndexOf(".") + 1) : n);
    const [v, p, r, f, e] = names as [string, string, string, string, string];
    const source =
      `package app {\n  public class Main {\n    public var fld:${f};\n` +
      `    public function m(arg:${p}):${r} {\n      var loc:${v} = null;\n      var vec:Vector.<${e}> = null;\n      return null;\n    }\n  }\n}\n`;
    const expected = [f, p, r, v, e].map(out);
    return { source, known: [...known], expected, resolved: names.filter((n) => knownSet.has(n)) };
  });


export interface FieldFormCase {
  /** AS3 source of `Ticker`, a class without a base, with methods m0..m{n-1}. */
  source: string;
  /** Methods read by an instance field initialiser (`init_<m>`). */
  inInit: string[];
  /** Methods read only by the constructor (`ctor_<m>`). */
  inCtor: string[];
  /** Every bound method, in declaration order. */
  expected: string[];
  hasCtor: boolean;
}

/**
 * A class with 1 to 4 methods; a non-empty subset is read by instance field initialisers, another subset only by the
 * constructor body. The class has a constructor when `inCtor` is non-empty or by choice.
 */
export const genFieldFormCase: fc.Arbitrary<FieldFormCase> = fc
  .record({
    count: fc.integer({ min: 1, max: 4 }),
    initPick: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
    ctorPick: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
    ctorByChoice: fc.boolean(),
    shuffle: fc.boolean(),
  })
  .map((r) => {
    const names = Array.from({ length: r.count }, (_, i) => `m${i}`);
    const inInit = names.filter((_, i) => r.initPick[i]);
    if (inInit.length === 0) inInit.push(names[names.length - 1]!);
    const inCtor = names.filter((n, i) => r.ctorPick[i] && !inInit.includes(n));
    const hasCtor = inCtor.length > 0 || r.ctorByChoice;
    const lines = ["package {", "  public class Ticker {"];
    for (const n of inInit) lines.push(`    public var init_${n}:Function = ${n};`);
    for (const n of inCtor) lines.push(`    public var ctor_${n}:Function;`);
    if (hasCtor) lines.push(`    public function Ticker() { ${inCtor.map((n) => `ctor_${n} = ${n};`).join(" ")} }`);
    for (const n of r.shuffle ? [...names].reverse() : names) lines.push(`    public function ${n}():Object { return this; }`);
    lines.push("  }", "}", "");
    const used = new Set([...inInit, ...inCtor]);
    const order = r.shuffle ? [...names].reverse() : names;
    return { source: lines.join("\n"), inInit, inCtor, expected: order.filter((n) => used.has(n)), hasCtor };
  });
