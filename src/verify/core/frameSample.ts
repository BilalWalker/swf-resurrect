import { DEFAULT_FRAME_COUNT } from './constants';

/**
 * Pick the 1-based frame numbers to compare (design section 1).
 * frameCount F >= 1; requested is K from --verify-frames (default 8).
 * The result is strictly increasing, starts at 1 and ends at F.
 * K is raised to 2 when F >= 2, and capped at F. Integer arithmetic only.
 */
export function selectFrames(frameCount: number, requested?: number): number[] {
  const f = Math.floor(frameCount);
  if (!(f >= 2)) return [1];
  const want = requested === undefined || !Number.isFinite(requested) ? DEFAULT_FRAME_COUNT : Math.floor(requested);
  const k = Math.min(f, Math.max(want, 2));
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    out.push(1 + Math.floor((2 * i * (f - 1) + (k - 1)) / (2 * (k - 1))));
  }
  return out;
}
