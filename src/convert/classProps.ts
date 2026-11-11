/** Returns the names declared with `var` in an AS3 source, skipping `[Embed(...)]` metadata lines. */
export function extractClassProperties(asSource: string): string[] {
  const names: string[] = [];
  for (const line of asSource.split(/\r?\n/)) {
    if (/^\s*\[\s*Embed\b/.test(line)) continue;
    for (const m of line.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1]);
  }
  return names;
}
