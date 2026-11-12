// Generators for Property 20 (Qualified_Name safety).
import fc from "fast-check";

const hostileSegment = fc.constantFrom("", ".", "..", "a/b", "a\\b", "C:x", "a\0b", "a\nb", "a\tb", "a*", "a?", "a|b", 'a"b', "a<b", "a>b");
const validSegment = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,8}$/);

export const genValidQualifiedName: fc.Arbitrary<string> = fc
  .array(validSegment, { minLength: 1, maxLength: 5 })
  .map((segs) => segs.join("."));

/** Case-only variants of a valid name are distinct valid names. */
export const genCaseVariantPair: fc.Arbitrary<[string, string]> = genValidQualifiedName.map((n) => [n, n.toUpperCase()]);

const hostileName = fc
  .array(fc.oneof(validSegment, hostileSegment), { minLength: 1, maxLength: 5 })
  .map((segs) => segs.join("."));

export const genAnyClassName: fc.Arbitrary<string> = fc.oneof(
  genValidQualifiedName,
  hostileName,
  fc.string({ maxLength: 20 }),
  fc.string({ unit: "binary", maxLength: 12 }),
);
