/** Trace formatting (design section 6, "Trace formatting"). Pure: no node:* imports. */

/** AS3 `trace` format: arguments separated by one space, each through String(). */
export function formatTraceCall(args: readonly unknown[]): string {
  return args.map(String).join(' ');
}

/**
 * Split text on `\n`, remove one trailing `\r` per line, and drop the final
 * empty element a terminating newline produces. Empty text gives no lines.
 */
export function splitTraceLines(text: string): string[] {
  const parts = text.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.map((p) => (p.endsWith('\r') ? p.slice(0, -1) : p));
}
