/** Removes ANSI escape sequences (colours, cursor moves) from captured process output. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}
