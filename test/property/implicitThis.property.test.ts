import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildMemberTables, lookupInstance, lookupMember } from "../../src/translate/memberTables";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { fcConfig } from "./config";
import { genChainCase } from "./gen/genClassContext";

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
