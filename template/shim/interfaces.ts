// AS3 interface marker. A translated interface exports a TypeScript interface and a token of the
// same name; `x is I` becomes `x instanceof I`, which calls the token's Symbol.hasInstance.
// Nothing here reads a class name, so a minified build behaves as an unminified one.

export interface AS3InterfaceToken<T = unknown> {
  /** Qualified_Name, for messages only. */
  readonly name: string;
  readonly parents: readonly AS3InterfaceToken[];
  /** `value instanceof I` calls this; the predicate lets TypeScript narrow to T. */
  [Symbol.hasInstance](value: unknown): value is T;
}

const registry = new WeakMap<Function, AS3InterfaceToken[]>();

/** True when `wanted` is `token` or one of its ancestors through `parents` (cycle-safe). */
function reaches(token: AS3InterfaceToken, wanted: AS3InterfaceToken, visited: Set<AS3InterfaceToken>): boolean {
  const stack: AS3InterfaceToken[] = [token];
  while (stack.length > 0) {
    const t = stack.pop() as AS3InterfaceToken;
    if (t === wanted) return true;
    if (visited.has(t)) continue;
    visited.add(t);
    for (const p of t.parents) stack.push(p);
  }
  return false;
}

export function defineInterface<T>(name: string, parents: readonly AS3InterfaceToken[] = []): AS3InterfaceToken<T> {
  const token: AS3InterfaceToken<T> = {
    name,
    parents,
    [Symbol.hasInstance](value: unknown): value is T {
      if (value === null || value === undefined) return false;
      if (typeof value !== "object" && typeof value !== "function") return false;
      const visited = new Set<AS3InterfaceToken>();
      let proto: object | null = Object.getPrototypeOf(value);
      while (proto !== null) {
        const ctor = Object.prototype.hasOwnProperty.call(proto, "constructor")
          ? (proto as { constructor: unknown }).constructor
          : undefined;
        if (typeof ctor === "function") {
          const declared = registry.get(ctor);
          if (declared !== undefined) {
            for (const d of declared) if (reaches(d, token, visited)) return true;
          }
        }
        proto = Object.getPrototypeOf(proto);
      }
      return false;
    },
  };
  return token;
}

export function declareImplements(cls: Function, ...interfaces: readonly AS3InterfaceToken[]): void {
  const existing = registry.get(cls);
  if (existing === undefined) registry.set(cls, [...interfaces]);
  else existing.push(...interfaces);
}
