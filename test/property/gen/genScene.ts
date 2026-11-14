import fc from "fast-check";
import type {
  ColorTransform8,
  DisplayListEntry,
  Matrix6,
  SceneJson,
  ShapeSymbol,
  SpriteSymbol,
} from "../../../template/runtime/scene";

/** Finite double that is never -0 (validateScene rejects -0). */
const finite = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .map((n) => (Object.is(n, -0) ? 0 : n));

const text = fc.string({ unit: "binary", maxLength: 12 });

const matrix: fc.Arbitrary<Matrix6> = fc.tuple(finite, finite, finite, finite, finite, finite);
const colorTransform: fc.Arbitrary<ColorTransform8> = fc.tuple(
  finite, finite, finite, finite, finite, finite, finite, finite,
);

const shapeSymbol = (id: number): fc.Arbitrary<ShapeSymbol> =>
  fc
    .record({
      x: finite,
      y: finite,
      width: fc.double({ min: 0, max: 1e6, noNaN: true }).map((n) => (Object.is(n, -0) ? 0 : n)),
      height: fc.double({ min: 0, max: 1e6, noNaN: true }).map((n) => (Object.is(n, -0) ? 0 : n)),
    })
    .map(({ x, y, width, height }) => ({
      type: "shape",
      file: `${id}.shape.json`,
      origin: { x, y },
      size: { width, height },
    }));

function frameArb(targets: number[]): fc.Arbitrary<DisplayListEntry[]> {
  const entry = fc.record({
    symbolId: fc.constantFrom(...targets),
    matrix,
    colorTransform,
    name: text,
    clipSpan: fc.option(fc.nat(50), { nil: undefined }),
  });
  return fc
    .uniqueArray(fc.integer({ min: -1000, max: 1000 }), { maxLength: 4 })
    .map((d) => d.sort((a, b) => a - b))
    .chain((depths) =>
      fc.tuple(...depths.map((depth) => entry.map(({ clipSpan, ...e }): DisplayListEntry => (clipSpan === undefined ? { depth, ...e } : { depth, ...e, clipDepth: depth + clipSpan })))),
    );
}

/** Sprite that may only reference symbols in `targets` (keeps the graph acyclic). */
function spriteSymbol(targets: number[]): fc.Arbitrary<SpriteSymbol> {
  return fc
    .record({
      frameCount: fc.integer({ min: 1, max: 5 }),
      className: fc.option(text, { nil: undefined }),
    })
    .chain(({ frameCount, className }) =>
      fc
        .record({
          frames: fc.array(frameArb(targets), { minLength: frameCount, maxLength: frameCount }),
          labels: fc.array(
            fc.record({ name: text, frame: fc.integer({ min: 1, max: frameCount }) }),
            { maxLength: 4 },
          ),
        })
        .map(({ frames, labels }): SpriteSymbol => {
          const sym: SpriteSymbol = { type: "sprite", frameCount, frames, labels };
          if (className !== undefined) sym.className = className;
          return sym;
        }),
    );
}

/**
 * Valid SceneJson: root sprite id 0, sprites 1..m, shapes m+1..m+s.
 * A sprite only references higher ids, so nesting is acyclic.
 */
export const genScene: fc.Arbitrary<SceneJson> = fc
  .record({
    spriteCount: fc.integer({ min: 0, max: 3 }),
    shapeCount: fc.integer({ min: 1, max: 3 }),
  })
  .chain(({ spriteCount, shapeCount }) => {
    const total = 1 + spriteCount + shapeCount;
    const parts: fc.Arbitrary<[string, ShapeSymbol | SpriteSymbol]>[] = [];
    for (let id = 0; id < total; id++) {
      const higher = Array.from({ length: total - id - 1 }, (_, i) => id + 1 + i);
      const sym: fc.Arbitrary<ShapeSymbol | SpriteSymbol> =
        id <= spriteCount ? spriteSymbol(higher) : shapeSymbol(id);
      parts.push(sym.map((s): [string, ShapeSymbol | SpriteSymbol] => [String(id), s]));
    }
    return fc.record({
      stage: fc.record({
        width: finite,
        height: finite,
        backgroundColor: fc
          .integer({ min: 0, max: 0xffffff })
          .map((n) => `#${n.toString(16).padStart(6, "0")}`),
        frameRate: fc.double({ min: 0.01, max: 1000, noNaN: true }),
      }),
      symbols: fc.tuple(...parts).map((ps) => Object.fromEntries(ps)),
    }).map(
      ({ stage, symbols }): SceneJson => ({ formatVersion: 2, stage, rootSymbolId: 0, symbols }),
    );
  });
