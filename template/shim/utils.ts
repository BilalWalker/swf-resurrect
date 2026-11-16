// flash.utils additions. Own module: no import of the display classes, so it never joins an import cycle.
import { registeredNameOf } from './classNames';
const definitions = new Map<string, unknown>();

/** Fills the definition registry. `classes.ts` calls it with every emitted class, before the Player is constructed. */
export function registerDefinitions(table: Readonly<Record<string, unknown>>): void {
  for (const key of Object.keys(table)) definitions.set(key, table[key]);
}

/** The class registered under the Qualified_Name `name`. Throws like Flash's ReferenceError when there is none. */
export function getDefinitionByName(name: string): any {
  if (!definitions.has(name)) throw new Error(`ReferenceError: Error #1065: Variable ${name} is not defined.`);
  return definitions.get(name);
}

/**
 * The class name of an instance or of a class object. The name comes from the registry (never from
 * constructor.name, which a minified build mangles); an unregistered class gives its JavaScript function name.
 */
export function getQualifiedClassName(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  const cls = typeof value === 'function' ? value : (value as object).constructor;
  if (typeof cls !== 'function') return typeof value;
  return registeredNameOf(cls) ?? cls.name;
}
let timeSource: (() => number) | null = null;
let timeStart = 0;
/** Shim-internal: the Player calls this once when it is constructed, so getTimer() reads the Player clock. */
export function setTimeSource(now: () => number): void {
  timeSource = now;
  timeStart = now();
}
/** Whole milliseconds since the Player was constructed, from the Player clock and never Date.now(). 0 with no Player. */
export function getTimer(): number {
  return timeSource === null ? 0 : Math.floor(timeSource() - timeStart);
}
