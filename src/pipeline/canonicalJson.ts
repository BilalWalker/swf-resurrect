// Canonical JSON text shared by Scene_JSON, the Unsupported_Feature_List and the Translation_Report.
// Pure: no I/O, no clock, no randomness.
// A hand-written printer is required because JS objects iterate integer-like keys
// ("2" before "10") regardless of insertion order, so JSON.stringify cannot sort them.

import { SceneParseError } from '../../template/runtime/scene';

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

/**
 * Canonical JSON (sorted keys, two-space indent, `\n`, one trailing newline) for any plain-data value.
 * `rootPath` only prefixes error messages.
 */
export function canonicalJson(value: unknown, rootPath = 'value'): string {
  return print(value, '', rootPath) + '\n';
}
