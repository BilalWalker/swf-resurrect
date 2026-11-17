import type { OutcomeCode } from "./outcome";

/** The one exit-code table (design "Data Models"). Read by tests and docs/outcome.md. */
export const EXIT_CODES = {
  converted: 0,
  "converted-with-gaps": 0,
  failed: 1,
  usage: 2,
  refused: 3,
} as const;

export function exitCodeFor(outcome: OutcomeCode): number {
  return EXIT_CODES[outcome];
}
