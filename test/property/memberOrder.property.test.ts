import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveIdentifier } from "../../src/translate/implicitThis";
import type { ResolveEnv } from "../../src/translate/implicitThis";
import { buildMemberTables } from "../../src/translate/memberTables";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { fcConfig } from "./config";
import { fileFromSource } from "./gen/genClassContext";

/** Chain C0 extends C1 ... extends C{depth}; C{depth} declares the instance member, C0 the static of the same name. */
function env(depth: number, member: string, isStatic: boolean): ResolveEnv {
  const files = Array.from({ length: depth + 1 }, (_, i) => {
    const base = i < depth ? ` extends C${i + 1}` : "";
    const body = i === depth ? `public var ${member}:int;` : i === 0 ? `public static var ${member}:int;` : "";
    return fileFromSource(`C${i}`, `package {\npublic class C${i}${base} { ${body} }\n}\n`);
  });
  return {
    tables: buildMemberTables(files, SHIM_MEMBER_TABLE),
    self: "C0",
    className: "C0",
    isStatic,
    locals: new Set(),
    classNames: new Set(),
    bindingOf: (q) => q,
  };
}

describe("Property 10: Inherited instance members win over statics", () => {
  const genName = fc.stringMatching(/^zz[A-Za-z0-9]{1,6}$/);
  /** **Validates: Requirements 9.1, 9.2, 9.5** */
  it("an instance context resolves to this.name, a static context to the static", () => {
    fc.assert(
      fc.property(genName, fc.integer({ min: 1, max: 5 }), (name, depth) => {
        expect(resolveIdentifier(name, 1, env(depth, name, false))).toMatchObject({ kind: "rewrite", text: `this.${name}` });
        expect(resolveIdentifier(name, 1, env(depth, name, true))).toMatchObject({ kind: "rewrite", text: `C0.${name}` });
      }),
      fcConfig,
    );
  });
});
