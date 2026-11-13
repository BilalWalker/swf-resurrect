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
