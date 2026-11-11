import type { Parameters } from "fast-check";

/** Shared fast-check configuration for all property tests. */
export const fcConfig: Parameters<unknown> = { numRuns: 100, verbose: 1 };
