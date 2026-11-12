/**
 * Flattens the FFDec shape wrapper `<g transform="matrix(1,0,0,1,tx,ty)">`: the transform
 * attribute is removed so the paths are in shape-origin space (they already are; the wrapper
 * only shifts the bounds to start at 0,0). Pixi ignores the wrapper, so removing it makes the
 * result independent of whether a renderer honours it. Only a pure translation on the first
 * `<g>` is touched. Idempotent and deterministic (a text edit, no re-serialisation).
 */
export function flattenSvgWrapper(svgText: string): string {
  const re = /(<g\b[^>]*?)\s+transform\s*=\s*"\s*matrix\(([^)]*)\)\s*"/;
  const m = re.exec(svgText);
  if (m === null) return svgText;
  const nums = m[2].split(/[\s,]+/).filter((s) => s !== '').map(Number);
  if (nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) return svgText;
  const [a, b, c, d] = nums;
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return svgText;
  return svgText.replace(re, '$1');
}
