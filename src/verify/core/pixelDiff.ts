/** Pixel diff (design section 2, D6, D7). Pure: no node:* imports, no clock, no randomness. */
import { AA_TOLERANCE, DIFF_MARK } from './constants';

/** RGBA8 image, `data.length === 4 * width * height`. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Rgb = readonly [number, number, number];

export interface FrameDiff {
  differingPixels: number;
  totalPixels: number;
  /** Integer 0..10000, see `roundedHundredths`. */
  matchHundredths: number;
  /** 1 = differing, one byte per pixel. */
  mask: Uint8Array;
}

export type CompareResult =
  | { ok: true; value: FrameDiff }
  | {
      ok: false;
      error: {
        kind: 'size-mismatch';
        a: { width: number; height: number };
        b: { width: number; height: number };
      };
    };

/** Composite over an opaque background. Result is opaque. */
export function flattenOnto(img: RgbaImage, background: Rgb): RgbaImage {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 4);
  const src = img.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = src[o + 3];
    for (let c = 0; c < 3; c++) {
      out[o + c] = Math.floor((src[o + c] * a + background[c] * (255 - a) + 127) / 255);
    }
    out[o + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Max channel difference between the pixels at byte offsets `p` and `q`. */
function dist(a: Uint8Array, p: number, b: Uint8Array, q: number): number {
  const dr = Math.abs(a[p] - b[q]);
  const dg = Math.abs(a[p + 1] - b[q + 1]);
  const db = Math.abs(a[p + 2] - b[q + 2]);
  return Math.max(dr, dg, db);
}

/** True when a 3x3 neighbour (not the pixel itself) contrasts with the pixel in the same image. */
function isEdge(img: RgbaImage, x: number, y: number): boolean {
  const { width, height, data } = img;
  const p = (y * width + x) * 4;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      if (dist(data, p, data, (ny * width + nx) * 4) > AA_TOLERANCE.edgeContrast) return true;
    }
  }
  return false;
}

/**
 * Integer half-up rounding of 10000 * part / whole, as hundredths of a percent.
 * `part` is the number of matching pixels, `whole` the total. Never 10000 when any
 * pixel differs (part < whole), and 0 when every pixel differs (part = 0).
 */
export function roundedHundredths(part: number, whole: number): number {
  if (whole <= 0) return 0;
  let result = Math.floor((20000 * part + whole) / (2 * whole));
  if (part < whole) result = Math.min(result, 9999);
  if (part <= 0) result = 0;
  return result;
}

/** Mean of integer hundredths, half up. 0 for an empty list (callers report null). */
export function meanHundredths(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return Math.floor((2 * sum + n) / (2 * n));
}

export function compareImages(reference: RgbaImage, rendered: RgbaImage, background: Rgb): CompareResult {
  if (reference.width !== rendered.width || reference.height !== rendered.height) {
    return {
      ok: false,
      error: {
        kind: 'size-mismatch',
        a: { width: reference.width, height: reference.height },
        b: { width: rendered.width, height: rendered.height },
      },
    };
  }
  const a = flattenOnto(reference, background);
  const b = flattenOnto(rendered, background);
  const { width, height } = a;
  const total = width * height;
  const mask = new Uint8Array(total);
  let differing = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = dist(a.data, i * 4, b.data, i * 4);
      if (d <= AA_TOLERANCE.strict) continue;
      if (d <= AA_TOLERANCE.edgeMax && (isEdge(a, x, y) || isEdge(b, x, y))) continue;
      mask[i] = 1;
      differing++;
    }
  }
  return {
    ok: true,
    value: {
      differingPixels: differing,
      totalPixels: total,
      matchHundredths: roundedHundredths(total - differing, total),
      mask,
    },
  };
}

/** Flattened reference at half brightness, differing pixels in DIFF_MARK. */
export function buildDiffImage(flatReference: RgbaImage, mask: Uint8Array): RgbaImage {
  const n = flatReference.width * flatReference.height;
  const out = new Uint8Array(n * 4);
  const src = flatReference.data;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (mask[i] === 1) {
      out[o] = DIFF_MARK[0];
      out[o + 1] = DIFF_MARK[1];
      out[o + 2] = DIFF_MARK[2];
      out[o + 3] = DIFF_MARK[3];
    } else {
      out[o] = src[o] >> 1;
      out[o + 1] = src[o + 1] >> 1;
      out[o + 2] = src[o + 2] >> 1;
      out[o + 3] = 255;
    }
  }
  return { width: flatReference.width, height: flatReference.height, data: out };
}
