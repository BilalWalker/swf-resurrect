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

/**
 * Known behaviour gaps of one sample, keyed by sample name. Each entry names a cause that was traced
 * from a missing or extra Reference_Trace line to a construct in the translation report or the
 * emitted code. It only describes the report; it never changes a score.
 */
export const KNOWN_BEHAVIOUR_GAPS_BY_SAMPLE: Readonly<Record<string, readonly string[]>> = {
  static_text: [
    'Test: the try/catch block is not translated ("try" is not supported), so new StaticText() and the two catch traces never run (missing lines 1-2)',
    'static text is drawn as shapes, so the child prints [object Shape], not [object StaticText] (missing line 3, extra line 1)',
  ],
  slider_component: [
    'fl.controls.Slider is omitted because fl.core.UIComponent fails to load (TS2304: TextFormat not found), so symbol 20 is a plain MovieClip and never dispatches SliderEvent.CHANGE (missing lines 2-4, changeHandler)',
  ],
};

/** The gaps the report lists for a sample: the global ones, then the sample's own. */
export function knownBehaviourGapsFor(sample: string): readonly string[] {
  const own = Object.prototype.hasOwnProperty.call(KNOWN_BEHAVIOUR_GAPS_BY_SAMPLE, sample)
    ? KNOWN_BEHAVIOUR_GAPS_BY_SAMPLE[sample]!
    : [];
  return [...KNOWN_BEHAVIOUR_GAPS, ...own];
}
