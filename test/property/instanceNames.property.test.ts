import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { registerClassName } from "../../template/shim/internal";
import { MovieClip } from "../../template/shim/MovieClip";
import { Shape } from "../../template/shim/Shape";
import { Sprite } from "../../template/shim/Sprite";
import { fcConfig } from "./config";

const ident = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/);
const qualifiedKey = fc
  .tuple(fc.array(ident, { maxLength: 3 }), ident)
  .map(([pkg, cls]) => ({ key: [...pkg, cls].join("."), cls }));
const shimKinds = [
  { make: () => new MovieClip(), name: "MovieClip" },
  { make: () => new Sprite(), name: "Sprite" },
  { make: () => new Shape(), name: "Shape" },
] as const;

describe("Property 52: Display objects print as [object ClassName]", () => {
  /** **Validates: Requirements 28.1, 28.7** */
  it("prints the unqualified registry key, also when the constructor's own name is replaced", () => {
    fc.assert(
      fc.property(qualifiedKey, fc.string(), ({ key, cls }, replacement) => {
        class Linked extends MovieClip {}
        registerClassName(Linked, key);
        Object.defineProperty(Linked, "name", { value: replacement });
        expect(String(new Linked())).toBe(`[object ${cls}]`);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 28.1, 28.7** */
  it("prints the Shim class name for the Shim classes, and the nearest registered ancestor for an unregistered subclass", () => {
    fc.assert(
      fc.property(fc.constantFrom(...shimKinds), fc.string(), (kind, replacement) => {
        const o = kind.make();
        Object.defineProperty(o.constructor, "name", { value: replacement, configurable: true });
        expect(String(o)).toBe(`[object ${kind.name}]`);
        class Helper extends (o.constructor as new () => Sprite) {}
        expect(String(new Helper())).toBe(`[object ${kind.name}]`);
      }),
      fcConfig,
    );
  });
});
