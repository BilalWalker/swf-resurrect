/** Trace comparison (design section 7, D8). Pure: no node:* imports. */

import { MAX_LCS_CELLS } from './constants';
import { roundedHundredths } from './pixelDiff';

/** `line` is 1-based. */
export interface TraceLine {
  line: number;
  text: string;
}

export interface Divergence {
  index: number;
  reference: string | null;
  captured: string | null;
}

export type TraceComparison =
  | {
      kind: 'compared';
      referenceLineCount: number;
      capturedLineCount: number;
      matched: number;
      missing: TraceLine[];
      extra: TraceLine[];
      traceScore: number;
      firstDivergence: Divergence | null;
    }
  | { kind: 'too-large'; referenceLineCount: number; capturedLineCount: number };

function findFirstDivergence(reference: readonly string[], captured: readonly string[]): Divergence | null {
  const len = Math.max(reference.length, captured.length);
  for (let i = 0; i < len; i++) {
    const r = i < reference.length ? reference[i] : null;
    const c = i < captured.length ? captured[i] : null;
    if (r !== c) return { index: i + 1, reference: r, captured: c };
  }
  return null;
}

export function compareTraces(reference: readonly string[], captured: readonly string[]): TraceComparison {
  const refCount = reference.length;
  const capCount = captured.length;

  // Trim the common prefix and suffix.
  let prefix = 0;
  const minLen = Math.min(refCount, capCount);
  while (prefix < minLen && reference[prefix] === captured[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    reference[refCount - 1 - suffix] === captured[capCount - 1 - suffix]
  ) {
    suffix++;
  }

  const n = refCount - prefix - suffix;
  const m = capCount - prefix - suffix;
  const width = m + 1;
  if ((n + 1) * width > MAX_LCS_CELLS) {
    return { kind: 'too-large', referenceLineCount: refCount, capturedLineCount: capCount };
  }

  // Suffix table: L[i][j] = LCS length of a[i..] and b[j..].
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    const a = reference[prefix + i];
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a === captured[prefix + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const missing: TraceLine[] = [];
  const extra: TraceLine[] = [];
  let matched = prefix + suffix;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (reference[prefix + i] === captured[prefix + j]) {
      matched++;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      missing.push({ line: prefix + i + 1, text: reference[prefix + i] });
      i++;
    } else {
      extra.push({ line: prefix + j + 1, text: captured[prefix + j] });
      j++;
    }
  }
  for (; i < n; i++) missing.push({ line: prefix + i + 1, text: reference[prefix + i] });
  for (; j < m; j++) extra.push({ line: prefix + j + 1, text: captured[prefix + j] });

  const whole = Math.max(refCount, capCount);
  const traceScore = whole === 0 ? 100 : roundedHundredths(matched, whole) / 100;

  return {
    kind: 'compared',
    referenceLineCount: refCount,
    capturedLineCount: capCount,
    matched,
    missing,
    extra,
    traceScore,
    firstDivergence: findFirstDivergence(reference, captured),
  };
}
