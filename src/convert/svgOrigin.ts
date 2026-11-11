/**
 * Returns (tx, ty) of the outer `<g transform="matrix(1,0,0,1,tx,ty)">` in an FFDec shape SVG,
 * or null when absent or not a pure translation. See test/fixtures/clickgoto/FINDINGS.md:
 * the shape is drawn at (-tx, -ty) so its own origin lands on the placement point.
 */
export function extractSvgOrigin(svgText: string): { x: number; y: number } | null {
  const g = /<g\b[^>]*?\btransform\s*=\s*"\s*matrix\(([^)]*)\)\s*"/.exec(svgText);
  if (!g) return null;
  const nums = g[1].split(/[\s,]+/).filter((s) => s !== '').map(Number);
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) return null;
  const [a, b, c, d, tx, ty] = nums;
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return null;
  return { x: tx + 0, y: ty + 0 };
}
