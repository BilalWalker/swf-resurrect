/**
 * Differing regions of a Frame_Diff mask (Requirement 21.1, 21.4). Core: pure, no IO.
 */

/** Inclusive pixel coordinates. */
export interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DiffRegion {
  id: number;
  bbox: Bbox;
  pixels: number;
  first: { x: number; y: number };
}

/**
 * 8-connected components of a 0/1 mask (1 = differing, as FrameDiff.mask). Ids are 1..n in the raster
 * order (row-major) of each region's first pixel. Iterative flood fill, O(width * height).
 * Throws RangeError when mask.length !== width * height.
 */
export function clusterDiffRegions(mask: Uint8Array, width: number, height: number): DiffRegion[] {
  if (mask.length !== width * height) {
    throw new RangeError(`mask length ${mask.length} does not match ${width}x${height}`);
  }
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const regions: DiffRegion[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    const sx = start % width;
    const sy = (start - sx) / width;
    const bbox: Bbox = { x0: sx, y0: sy, x1: sx, y1: sy };
    let pixels = 0;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i - x) / width;
      pixels++;
      if (x < bbox.x0) bbox.x0 = x;
      if (x > bbox.x1) bbox.x1 = x;
      if (y < bbox.y0) bbox.y0 = y;
      if (y > bbox.y1) bbox.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = ny * width + nx;
          if (mask[j] !== 1 || seen[j] === 1) continue;
          seen[j] = 1;
          stack[top++] = j;
        }
      }
    }
    regions.push({ id: regions.length + 1, bbox, pixels, first: { x: sx, y: sy } });
  }
  return regions;
}

/** At most maxRows rows in id order and one aggregate for the rest, so the pixel counts always add up. */
export function regionTable(
  regions: readonly DiffRegion[],
  maxRows: number,
): { rows: DiffRegion[]; omitted: { regions: number; pixels: number } } {
  const keep = Math.max(0, Math.floor(maxRows));
  const rows = regions.slice(0, keep);
  let pixels = 0;
  for (const r of regions.slice(keep)) pixels += r.pixels;
  return { rows, omitted: { regions: regions.length - rows.length, pixels } };
}
