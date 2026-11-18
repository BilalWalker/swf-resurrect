import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isObfuscated, obfuscationVerdict } from "../../src/recover/detect";
import { fcConfig } from "./config";
import { genInvalidName, genValidName } from "./gen/genAbcPool";

const IDENTIFIER = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
const counts = (names: string[]) => ({
  namesScanned: names.length,
  invalidNames: names.filter((n) => !IDENTIFIER.test(n)).length,
  complete: true,
});

describe("Obfuscation verdict properties", () => {
  it("Property 15: the name rule flags generated names exactly when they are outside the alphabet", () => {
    // **Validates: Requirements 14.2, 14.6**
    fc.assert(
      fc.property(genValidName, genInvalidName, (v, i) => {
        expect(IDENTIFIER.test(v)).toBe(true);
        expect(IDENTIFIER.test(i)).toBe(false);
      }),
      fcConfig,
    );
  });

  it("Property 15: the verdict is deterministic and is obfuscated iff invalid/total >= 0.20 and invalid >= 5", () => {
    // **Validates: Requirements 14.2, 14.3, 14.6**
    fc.assert(
      fc.property(fc.array(fc.oneof(genValidName, genInvalidName), { maxLength: 60 }), (names) => {
        const c = counts(names);
        const expected = c.invalidNames >= 5 && c.invalidNames / c.namesScanned >= 0.2;
        expect(isObfuscated(c)).toBe(expected);
        expect(obfuscationVerdict(c)).toEqual(obfuscationVerdict(c));
        expect(obfuscationVerdict(c).detected).toBe(expected);
        expect(isObfuscated({ ...c, complete: false })).toBe(false);
      }),
      fcConfig,
    );
  });

  it("Property 15: replacing a valid name by an invalid one never turns obfuscated into not obfuscated", () => {
    // **Validates: Requirements 14.3, 14.6**
    fc.assert(
      fc.property(
        fc.array(fc.oneof(genValidName, genInvalidName), { minLength: 1, maxLength: 60 }),
        fc.nat(),
        genInvalidName,
        (names, at, bad) => {
          const k = at % names.length;
          const after = names.slice();
          after[k] = bad;
          if (isObfuscated(counts(names))) expect(isObfuscated(counts(after))).toBe(true);
        },
      ),
      fcConfig,
    );
  });
});
