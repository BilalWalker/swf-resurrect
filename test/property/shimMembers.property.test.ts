import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extractShimMembers, parseShimMembersTs, renderShimMembersTs } from "../../src/translate/shimMembers";
import { fcConfig } from "./config";
import { genShimCase, genShimTable } from "./gen/genShimDeclarations";

describe("Property 37: Shim declaration extraction and its round trip", () => {
  /** **Validates: Requirements 22.5, 22.12, 15.1** */
  it("extraction gives the members the declarations hold, whatever the noise around them", () => {
    fc.assert(
      fc.property(genShimCase, (c) => {
        expect(extractShimMembers(c.sources)).toEqual(c.expected);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 22.5, 15.1** */
  it("extraction does not depend on the order of the files", () => {
    fc.assert(
      fc.property(genShimCase, (c) => {
        expect(extractShimMembers([...c.sources].reverse())).toEqual(c.expected);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 22.5, 15.2** */
  it("parse inverts render, and render is canonical", () => {
    fc.assert(
      fc.property(genShimTable, (table) => {
        const text = renderShimMembersTs(table);
        expect(parseShimMembersTs(text)).toEqual(table);
        expect(renderShimMembersTs(parseShimMembersTs(text))).toBe(text);
        expect(Object.keys(table)).toEqual([...Object.keys(table)].sort());
      }),
      fcConfig,
    );
  });
});
