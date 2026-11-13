// The class-name registration (Requirement 28.1, D34). Its own module so that Stage.ts can use it without a cycle
// (internal.ts imports Stage.ts). internal.ts re-exports both functions.
const classNames = new WeakMap<Function, string>();

/**
 * Registers the AS3 class name of `cls`. A qualified name is stored unqualified (the text after the last `.`).
 * The name never comes from `constructor.name`, so a minified build prints the same text.
 */
export function registerClassName(cls: Function, name: string): void {
  classNames.set(cls, name.slice(name.lastIndexOf('.') + 1));
}

/** The registered name of the nearest registered constructor on the prototype chain of `object`; 'Object' when none. */
export function classNameOf(object: object): string {
  for (let p: object | null = Object.getPrototypeOf(object); p !== null; p = Object.getPrototypeOf(p)) {
    if (!Object.prototype.hasOwnProperty.call(p, 'constructor')) continue;
    const ctor = (p as { constructor: unknown }).constructor;
    if (typeof ctor !== 'function') continue;
    const name = classNames.get(ctor);
    if (name !== undefined) return name;
  }
  return 'Object';
}
