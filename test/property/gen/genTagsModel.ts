import fc from "fast-check";
import type {
  ClassSourceModel,
  MatrixModel,
  ShapeAssetModel,
  SpriteModel,
  SymbolClassEntry,
  TagsModel,
  TimelineOp,
  UnsupportedObservation,
} from "../../../src/convert/model";

const INSTANCE_NAMES = ["", "a", "b", "c"];
const PROP_NAMES = ["a", "b", "other"];

const genMatrix = fc.record({
  a: fc.constantFrom(1, 0.5, -1, 0),
  b: fc.constantFrom(0, 0.25),
  c: fc.constantFrom(0, -0.25),
  d: fc.constantFrom(1, 2, 0),
  txTwips: fc.integer({ min: -20000, max: 20000 }),
  tyTwips: fc.integer({ min: -20000, max: 20000 }),
});

interface FrameStep {
  placements: Array<{ depth: number; pick: number; matrix: MatrixModel | undefined; name: string }>;
  label: string | undefined;
}

const genFrameStep: fc.Arbitrary<FrameStep> = fc.record({
  placements: fc.uniqueArray(
    fc.record({
      depth: fc.integer({ min: 1, max: 5 }),
      pick: fc.nat({ max: 1000 }),
      matrix: fc.option(genMatrix, { nil: undefined }),
      name: fc.constantFrom(...INSTANCE_NAMES),
    }),
    { maxLength: 3, selector: (p) => p.depth },
  ),
  label: fc.option(fc.constantFrom("start", "mid", "end"), { nil: undefined }),
});

const genSvg = fc.tuple(fc.integer({ min: 1, max: 99 }), fc.boolean()).map(([n, crlf]) => {
  const eol = crlf ? "\r\n" : "\n";
  return `<svg>${eol}<g transform="matrix(1,0,0,1,${n},${n + 1})"><path d="M0 0 L${n} ${n}"/></g>${eol}</svg>`;
});

/** Build a timeline from frame steps; each frame places the chosen characters and ends with showFrame. */
function toOps(frames: FrameStep[], candidates: number[]): TimelineOp[] {
  const ops: TimelineOp[] = [];
  const placedLabels = new Set<string>();
  const placedAt = new Set<number>();
  for (const f of frames) {
    if (f.label !== undefined && !placedLabels.has(f.label)) {
      placedLabels.add(f.label);
      ops.push({ kind: "label", name: f.label });
    }
    // Each frame starts by clearing previously placed depths so placements stay valid.
    for (const d of [...placedAt].sort((x, y) => x - y)) ops.push({ kind: "remove", depth: d });
    placedAt.clear();
    if (candidates.length > 0) {
      for (const p of f.placements) {
        ops.push({
          kind: "place",
          depth: p.depth,
          characterId: candidates[p.pick % candidates.length],
          move: false,
          matrix: p.matrix,
          name: p.name === "" ? undefined : p.name,
        });
        placedAt.add(p.depth);
      }
    }
    ops.push({ kind: "showFrame" });
  }
  return ops;
}

/**
 * Convertible models: valid references, no cycles (a sprite only references
 * shapes, morph shapes, text characters and sprites with a lower id).
 */
export const genTagsModel: fc.Arbitrary<TagsModel> = fc
  .record({
    nShapes: fc.integer({ min: 1, max: 5 }),
    nMorph: fc.integer({ min: 0, max: 2 }),
    nText: fc.integer({ min: 0, max: 2 }),
    nStaticText: fc.integer({ min: 0, max: 2 }),
    nButton: fc.integer({ min: 0, max: 2 }),
    nSound: fc.integer({ min: 0, max: 1 }),
    nVideo: fc.integer({ min: 0, max: 1 }),
    nBitmap: fc.integer({ min: 0, max: 2 }),
    svgs: fc.array(genSvg, { minLength: 5, maxLength: 5 }),
    rootFrames: fc.array(genFrameStep, { minLength: 1, maxLength: 4 }),
    sprites: fc.array(
      fc.record({
        frames: fc.array(genFrameStep, { minLength: 1, maxLength: 4 }),
        linked: fc.boolean(),
        props: fc.option(fc.subarray(PROP_NAMES), { nil: null }),
      }),
      { maxLength: 4 },
    ),
    background: fc.option(
      fc.record({ r: fc.nat({ max: 255 }), g: fc.nat({ max: 255 }), b: fc.nat({ max: 255 }) }),
      { nil: null },
    ),
    frameRate: fc.constantFrom(12, 24, 30),
  })
  .map((g): TagsModel => {
    let next = 1;
    const shapeIds = Array.from({ length: g.nShapes }, () => next++);
    const morphIds = Array.from({ length: g.nMorph }, () => next++);
    const textIds = Array.from({ length: g.nText }, () => next++);
    const staticTextIds = Array.from({ length: g.nStaticText }, () => next++);
    const buttonIds = Array.from({ length: g.nButton }, () => next++);
    const soundIds = Array.from({ length: g.nSound }, () => next++);
    const videoIds = Array.from({ length: g.nVideo }, () => next++);
    const bitmapIds = Array.from({ length: g.nBitmap }, () => next++);
    const base = [...shapeIds, ...morphIds, ...textIds, ...staticTextIds, ...buttonIds, ...soundIds, ...videoIds, ...bitmapIds];

    const shapeAssets: ShapeAssetModel[] = shapeIds.map((id, i) => ({
      id,
      svg: g.svgs[i],
      origin: { x: id, y: id + 1 },
    }));

    const sprites: SpriteModel[] = [];
    const symbolClasses: SymbolClassEntry[] = [];
    const classSources: ClassSourceModel[] = [];
    const spriteIds: number[] = [];
    for (const s of g.sprites) {
      const id = next++;
      sprites.push({ id, declaredFrameCount: s.frames.length, ops: toOps(s.frames, [...base, ...spriteIds]) });
      spriteIds.push(id);
      if (s.linked) {
        const className = `C${id}`;
        symbolClasses.push({ id, className });
        classSources.push({ className, properties: s.props });
      }
    }
    const unsupported: UnsupportedObservation[] = [
      ...morphIds.map((id): UnsupportedObservation => ({ kind: "morph-shape", tagName: "DefineMorphShapeTag", characterId: id })),
      ...textIds.map((id): UnsupportedObservation => ({ kind: "text", tagName: "DefineEditTextTag", characterId: id })),
      ...buttonIds.map((id): UnsupportedObservation => ({ kind: "button", tagName: "DefineButton2Tag", characterId: id })),
      ...soundIds.map((id): UnsupportedObservation => ({ kind: "sound", tagName: "DefineSoundTag", characterId: id })),
      ...videoIds.map((id): UnsupportedObservation => ({ kind: "video", tagName: "DefineVideoStreamTag", characterId: id })),
    ];
    return {
      xmlVersion: { major: 4, minor: 2 },
      header: { widthPx: 550, heightPx: 400, frameRate: g.frameRate, frameCount: g.rootFrames.length },
      background: g.background,
      root: { declaredFrameCount: g.rootFrames.length, ops: toOps(g.rootFrames, [...base, ...spriteIds]) },
      sprites,
      declaredShapeIds: shapeIds,
      morphShapeIds: morphIds,
      staticTextIds,
      bitmapIds,
      shapeAssets,
      textAssets: [],
      symbolClasses,
      classSources,
      unsupported,
    };
  });

/** Deterministic permutation driven by generated sort keys. */
export function permute<T>(list: readonly T[], keys: readonly number[]): T[] {
  return list
    .map((item, i) => ({ item, key: keys[i % Math.max(keys.length, 1)] ?? 0, i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.item);
}

export const genKeys: fc.Arbitrary<number[]> = fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 20 });
