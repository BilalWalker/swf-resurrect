import fc from "fast-check";
import { MN, type PoolSpec } from "../../support/hostileSwf";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$\u00e9\u00fc\u4e2d".split("");
const DIGITS = "0123456789".split("");
const BAD = [" ", ".", "-", "/", "\u0001", "\u00a0", "@", "#", "\u2603", "<", ":"];
/** A legal identifier: a letter, `_` or `$`, then letters, digits, `_` or `$`. */
export const genValidName: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...LETTERS), fc.array(fc.constantFrom(...LETTERS, ...DIGITS), { maxLength: 6 }))
  .map(([h, t]) => h + t.join(""));
/** A non-empty name the rule must flag: it starts with a digit or holds a character outside the alphabet. */
export const genInvalidName: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(fc.constantFrom(...DIGITS), fc.array(fc.constantFrom(...LETTERS), { maxLength: 4 })).map(([d, t]) => d + t.join("")),
  fc
    .tuple(genValidName, fc.constantFrom(...BAD), fc.array(fc.constantFrom(...LETTERS), { maxLength: 3 }))
    .map(([a, b, c]) => a + b + c.join("")),
  fc.constantFrom(...BAD),
);
export interface GenPool {
  spec: PoolSpec;
  /** Named multinames placed (names that are not empty). */
  placed: number;
  /** Of those, the invalid ones. */
  invalid: number;
}
const NAMED = [MN.QName, MN.QNameA, MN.RTQName, MN.RTQNameA, MN.Multiname, MN.MultinameA];
const UNNAMED = [MN.RTQNameL, MN.RTQNameLA, MN.MultinameL, MN.MultinameLA, MN.TypeName];
const genMultiname = fc.oneof(
  fc.tuple(fc.constantFrom(...NAMED), fc.boolean()).chain(([kind, bad]) =>
    (bad ? genInvalidName : genValidName).map((name) => ({ m: { kind, name } as PoolSpec["multinames"] extends Array<infer T> | undefined ? T : never, bad, named: true })),
  ),
  fc.tuple(fc.constantFrom(...UNNAMED), fc.integer({ min: 0, max: 3 })).map(([kind, typeArgs]) => ({
    m: { kind, typeArgs } as { kind: number; typeArgs: number },
    bad: false,
    named: false,
  })),
);
/** A constant pool with every table filled, literals and dotted namespace names mixed with invalid text, and a known count of names. */
export const genAbcPool: fc.Arbitrary<GenPool> = fc
  .record({
    ints: fc.integer({ min: 0, max: 4 }),
    uints: fc.integer({ min: 0, max: 4 }),
    doubles: fc.integer({ min: 0, max: 3 }),
    literals: fc.array(fc.oneof(genInvalidName, genValidName), { maxLength: 4 }),
    namespaces: fc.array(fc.array(genValidName, { minLength: 1, maxLength: 3 }).map((p) => p.join(".")), { maxLength: 3 }),
    multinames: fc.array(genMultiname, { maxLength: 12 }),
  })
  .map((r) => ({
    spec: { ...r, multinames: r.multinames.map((x) => x.m) },
    placed: r.multinames.filter((x) => x.named).length,
    invalid: r.multinames.filter((x) => x.named && x.bad).length,
  }));
