// Canonical Scene_JSON text. Pure: no I/O, no clock, no randomness.
// A hand-written printer is required because JS objects iterate integer-like keys
// ("2" before "10") regardless of insertion order, so JSON.stringify cannot sort them.

import { SceneParseError, parseScene, validateScene } from '../../template/runtime/scene';
import type { SceneJson } from '../../template/runtime/scene';

export { parseScene };

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // JS string comparison is by UTF-16 code unit
}

function print(value: unknown, indent: string, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new SceneParseError(`${path}: must be a finite number`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'object': {
      const inner = indent + '  ';
      if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value.map((v, i) => inner + print(v, inner, `${path}[${i}]`));
        return `[\n${items.join(',\n')}\n${indent}]`;
      }
      const rec = value as Record<string, unknown>;
      const keys = Object.keys(rec)
        .filter((k) => rec[k] !== undefined)
        .sort(compareCodeUnits);
      if (keys.length === 0) return '{}';
      const items = keys.map(
        (k) => `${inner}${JSON.stringify(k)}: ${print(rec[k], inner, `${path}.${k}`)}`,
      );
      return `{\n${items.join(',\n')}\n${indent}}`;
    }
    default:
      throw new SceneParseError(`${path}: unsupported value type ${typeof value}`);
  }
}

/** Canonical JSON (sorted keys, two-space indent, one trailing newline) for any plain-data value. */
export function canonicalJson(value: unknown): string {
  return print(value, '', 'value') + '\n';
}

export function serialiseScene(scene: SceneJson): string {
  const text = print(scene, '', 'scene') + '\n';
  // -0 is already normalised in the text; validate the result so invalid scenes never get written.
  validateScene(JSON.parse(text));
  return text;
}
