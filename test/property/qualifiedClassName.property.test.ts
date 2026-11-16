import fc from "fast-check";
import { describe, it } from "vitest";
import { getQualifiedClassName } from "../../template/shim";
import { registerClassName } from "../../template/shim/internal";
import { fcConfig } from "./config";

/** **Validates: Requirements 12.1, 12.2, 12.3** (Property 12: Qualified class names come from the registry) */
describe("Property 12: qualified class names come from the registry", () => {
  const ident = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/);
  it("an instance and the class return the registered name", () => {
    fc.assert(
      fc.property(ident, (name) => {
        const Cls = class {};
        registerClassName(Cls, name);
        return getQualifiedClassName(Cls) === name && getQualifiedClassName(new Cls()) === name;
      }),
      fcConfig,
    );
  });
  it("an unregistered class returns the function name", () => {
    fc.assert(
      fc.property(ident, (name) => {
        const holder = { [name]: class {} };
        const Cls = holder[name]!;
        return getQualifiedClassName(Cls) === Cls.name && getQualifiedClassName(new Cls()) === Cls.name;
      }),
      fcConfig,
    );
  });
});
