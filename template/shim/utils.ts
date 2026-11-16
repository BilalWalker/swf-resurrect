// flash.utils additions. Own module: no import of the display classes, so it never joins an import cycle.
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
