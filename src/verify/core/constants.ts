/** Verify_Core constants (design D6, D7, section 2 and the constants list). Pure: no node:* imports. */

/** Version of the Fidelity_Report JSON format. */
export const FORMAT_VERSION = 1;

/** Number of frames sampled when --verify-frames is not given. */
export const DEFAULT_FRAME_COUNT = 8;

/**
 * Anti_Aliasing_Tolerance, recorded in the report. Scores computed with
 * different values are not comparable.
 */
export const AA_TOLERANCE = {
  strict: 8,
  edgeMax: 128,
  edgeContrast: 48,
  neighbourhood: '3x3',
} as const;

/** Diff_Image colour for a differing pixel (RGBA, magenta). */
export const DIFF_MARK: readonly [number, number, number, number] = [255, 0, 255, 255];

/** Largest LCS table (cells) the trace comparison builds. */
export const MAX_LCS_CELLS = 25_000_000;

/** Longest detail text kept in a report. */
export const MAX_DETAIL_CHARS = 200;

/** Known behaviour gaps. Gets 'goto-extra-cycle' only through the G7 revert rule. */
export const KNOWN_BEHAVIOUR_GAPS: readonly string[] = [];
