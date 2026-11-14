// PURE: TagsModel -> ConvertResult (design, "Converter pure part").
// No fs, child_process, clock, randomness or locale-dependent calls.
import { validateScene } from '../../template/runtime/scene';
import type { DisplayListEntry, SceneJson, ShapeSymbol, SpriteSymbol } from '../../template/runtime/scene';
import { printShapeJson } from '../../template/runtime/shapeJson';
import { sortUnsupported } from '../pipeline/unsupported';
import type { UnsupportedFeatureEntry } from '../pipeline/unsupported';
import { MalformedFrameDataError, ShapeExportError, SymbolCycleError, UnknownSymbolError } from './errors';
import type { TagsModel, TimelineModel, UnsupportedKind } from './model';
import { resolveTimeline } from './resolveTimeline';
import { svgToShapeJson } from './svgToShape';

export interface ShapeFile {
  fileName: string; // "<id>.shape.json"
  content: string; // canonical Shape_JSON text
}

export interface ImageFile {
  fileName: string; // "images/<bitmapId>.<ext>"
  bytes: Uint8Array;
}

export interface ConvertResult {
  scene: SceneJson;
  shapeFiles: ShapeFile[]; // sorted by numeric id
  imageFiles: ImageFile[]; // sorted by bitmap id
  unsupported: UnsupportedFeatureEntry[]; // sorted, total order
  warnings: string[]; // sorted
  stats: { svgWritten: number; morphSkipped: number; declaredShapes: number };
}

/** Character kinds whose placements are dropped (Requirement 3.8). */
const DROPPED_CHARACTER_KINDS: ReadonlySet<UnsupportedKind> = new Set<UnsupportedKind>([
  'text',
  'sound',
  'button',
  'video',
]);

function isId(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function malformed(item: string, spriteId: number | 'root' = 'root', frame: number | null = null): never {
  throw new MalformedFrameDataError(spriteId, frame, item);
}

function validateTimeline(t: TimelineModel, who: number | 'root'): void {
  if (!t || !Array.isArray(t.ops)) malformed('ops must be an array', who);
  if (t.declaredFrameCount !== null && !isId(t.declaredFrameCount)) malformed('invalid declaredFrameCount', who);
  for (const op of t.ops) {
    if (typeof op !== 'object' || op === null) malformed('operation must be an object', who);
    if (op.kind === 'place' || op.kind === 'remove') {
      if (!isId(op.depth)) malformed(`invalid depth ${String(op.depth)}`, who);
      if (op.characterId !== undefined && !isId(op.characterId)) {
        malformed(`invalid character id ${String(op.characterId)}`, who);
      }
    }
    if (op.kind === 'place' && op.matrix !== undefined) {
      const m = op.matrix;
      if (!Number.isInteger(m.txTwips) || !Number.isInteger(m.tyTwips)) {
        malformed(`non-integer translation at depth ${op.depth}`, who);
      }
    }
  }
}

function validateModel(model: TagsModel): void {
  if (typeof model !== 'object' || model === null) malformed('model must be an object');
  const lists: Array<[string, unknown]> = [
    ['sprites', model.sprites],
    ['declaredShapeIds', model.declaredShapeIds],
    ['morphShapeIds', model.morphShapeIds],
    ['shapeAssets', model.shapeAssets],
    ['symbolClasses', model.symbolClasses],
    ['classSources', model.classSources],
    ['unsupported', model.unsupported],
  ];
  for (const [name, list] of lists) if (!Array.isArray(list)) malformed(`${name} must be an array`);
  for (const id of model.declaredShapeIds) if (!isId(id)) malformed(`invalid shape id ${String(id)}`);
  for (const id of model.morphShapeIds) if (!isId(id)) malformed(`invalid morph shape id ${String(id)}`);
  for (const a of model.shapeAssets) if (!isId(a.id)) malformed(`invalid shape asset id ${String(a.id)}`);
  for (const s of model.symbolClasses) if (!isId(s.id)) malformed(`invalid symbolClass id ${String(s.id)}`);
  for (const o of model.unsupported) {
    if (o.characterId !== undefined && !isId(o.characterId)) malformed(`invalid observation id ${String(o.characterId)}`);
  }
  validateTimeline(model.root, 'root');
  for (const s of model.sprites) {
    if (!isId(s.id)) malformed(`invalid sprite id ${String(s.id)}`);
    validateTimeline(s, s.id);
  }
  const h = model.header;
  if (!h || ![h.widthPx, h.heightPx, h.frameRate].every((n) => Number.isFinite(n)) || h.frameRate <= 0) {
    malformed('invalid header');
  }
}

function colourHex(bg: TagsModel['background']): string {
  if (bg === null) return '#ffffff';
  const part = (n: number): string => {
    if (!Number.isInteger(n) || n < 0 || n > 255) malformed(`invalid background colour component ${String(n)}`);
    return n.toString(16).padStart(2, '0');
  };
  return `#${part(bg.r)}${part(bg.g)}${part(bg.b)}`;
}

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

export function convertModel(model: TagsModel): ConvertResult {
  validateModel(model);
  const warnings: string[] = [];
  const unsupported: UnsupportedFeatureEntry[] = [];

  // Index.
  const spriteById = new Map<number, TimelineModel>();
  for (const s of model.sprites) {
    if (s.id === 0 || spriteById.has(s.id)) malformed(`duplicate or reserved sprite id ${s.id}`, s.id);
    spriteById.set(s.id, s);
  }
  const assetById = new Map<number, TagsModel['shapeAssets'][number]>();
  for (const a of model.shapeAssets) {
    if (assetById.has(a.id)) malformed(`duplicate shape asset ${a.id}`);
    assetById.set(a.id, a);
  }
  const classById = new Map<number, string>();
  for (const e of model.symbolClasses) {
    if (classById.has(e.id)) throw new MalformedFrameDataError('root', null, `symbolClass: duplicate id ${e.id}`);
    classById.set(e.id, e.className);
  }
  const propsByClass = new Map<string, string[] | null>();
  for (const c of model.classSources) propsByClass.set(c.className, c.properties);

  const shapeIds = sortedUnique(model.declaredShapeIds);
  const morphIds = sortedUnique(model.morphShapeIds);
  const morphSet = new Set(morphIds);
  const shapeSet = new Set(shapeIds);
  for (const id of morphIds) {
    if (shapeSet.has(id) || spriteById.has(id) || id === 0) malformed(`character id ${id} defined twice`);
  }
  for (const id of shapeIds) {
    if (spriteById.has(id) || id === 0) malformed(`character id ${id} defined twice`);
  }

  // Shapes.
  const symbols: Record<string, ShapeSymbol | SpriteSymbol> = {};
  const shapeFiles: ShapeFile[] = [];
  const images = new Map<number, ImageFile>();
  for (const id of shapeIds) {
    if (morphSet.has(id)) continue;
    const asset = assetById.get(id);
    if (asset === undefined || asset.svg === null) throw new ShapeExportError(id, 'missing');
    if (asset.svg === '') throw new ShapeExportError(id, 'empty');
    const built = svgToShapeJson(asset.svg.replace(/\r\n?/g, '\n'), 'shape');
    shapeFiles.push({ fileName: `${id}.shape.json`, content: printShapeJson(built.shape) });
    for (const img of built.images) {
      if (!images.has(img.bitmapId)) {
        images.set(img.bitmapId, { fileName: `images/${img.bitmapId}.${img.ext}`, bytes: img.bytes });
      }
    }
    for (const limit of built.limits) unsupported.push({ kind: limit.kind, id, message: limit.message });
    const w = /\bwidth="([\d.]+)px"/.exec(asset.svg);
    const h = /\bheight="([\d.]+)px"/.exec(asset.svg);
    if (w === null || h === null) warnings.push(`shape ${id}: no px width or height in SVG; using size 0 x 0`);
    if (asset.origin === null) {
      warnings.push(`shape ${id}: no origin wrapper found in SVG; using (0, 0)`);
    }
    const x = asset.origin?.x ?? 0;
    const y = asset.origin?.y ?? 0;
    symbols[String(id)] = {
      type: 'shape',
      file: `${id}.shape.json`,
      origin: { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y },
      size: { width: w === null ? 0 : Number(w[1]), height: h === null ? 0 : Number(h[1]) },
    };
  }

  // Unsupported observations and morph shapes.
  const unsupportedChars = new Map<number, UnsupportedKind>();
  for (const id of morphIds) {
    unsupportedChars.set(id, 'morph-shape');
    unsupported.push({ kind: 'morph-shape', id, message: 'morph shapes are unsupported' });
  }
  for (const o of model.unsupported) {
    if (o.kind === 'morph-shape' && o.characterId !== undefined && morphSet.has(o.characterId)) continue;
    if (o.characterId !== undefined && DROPPED_CHARACTER_KINDS.has(o.kind)) {
      unsupportedChars.set(o.characterId, o.kind);
    }
    const entry: UnsupportedFeatureEntry = {
      kind: o.kind,
      tag: o.tagName,
      message: o.message ?? `${o.tagName} (${o.kind}) is unsupported`,
    };
    if (o.characterId !== undefined) entry.id = o.characterId;
    unsupported.push(entry);
  }

  // Static text is dropped as kind text until Task 12 draws it; DefineBits characters are never placed directly.
  for (const id of model.staticTextIds ?? []) if (!unsupportedChars.has(id)) unsupportedChars.set(id, 'text');
  const bitmapSet = new Set<number>();
  for (const id of model.bitmapIds ?? []) {
    if (unsupportedChars.has(id)) continue;
    unsupportedChars.set(id, 'bitmap-fill');
    bitmapSet.add(id);
  }

  // Timelines.
  const timelines: Array<[number, TimelineModel]> = [[0, model.root]];
  for (const id of [...spriteById.keys()].sort((a, b) => a - b)) {
    timelines.push([id, spriteById.get(id) as TimelineModel]);
  }
  const edges = new Map<number, number[]>();
  for (const [id, t] of timelines) {
    const r = resolveTimeline({
      spriteId: id,
      ops: t.ops,
      declaredFrameCount: t.declaredFrameCount,
      unsupportedCharacters: unsupportedChars,
    });
    warnings.push(...r.warnings);
    for (const d of r.droppedPlacements) {
      const where = `${d.kind} at depth ${d.depth} in ${id === 0 ? 'root timeline' : `sprite ${id}`}, frame ${d.frame}`;
      unsupported.push({
        kind: d.kind,
        message:
          d.kind === 'bitmap-fill' && bitmapSet.has(d.characterId ?? -1)
            ? `placement dropped: DefineBits character placed directly (${where})`
            : `placement dropped: ${where}`,
        context: { spriteId: d.spriteId, frame: d.frame, depth: d.depth },
      });
    }
    const sprite: SpriteSymbol = {
      type: 'sprite',
      frameCount: r.frames.length,
      frames: r.frames,
      labels: r.labels,
    };
    const className = classById.get(id);
    if (className !== undefined) sprite.className = className;
    symbols[String(id)] = sprite;

    // Reference check (Requirement 4.7) and edges for the cycle check.
    const targets = new Set<number>();
    r.frames.forEach((frame: DisplayListEntry[], fi: number) => {
      for (const e of frame) {
        if (!Object.prototype.hasOwnProperty.call(symbols, String(e.symbolId)) && !spriteById.has(e.symbolId)) {
          throw new UnknownSymbolError(e.symbolId, id, fi + 1, e.depth);
        }
        if (spriteById.has(e.symbolId)) targets.add(e.symbolId);
      }
    });
    edges.set(id, [...targets].sort((a, b) => a - b));
  }

  // Cycle check (iterative-free DFS; depth is bounded by the sprite count).
  const state = new Map<number, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: number[] = [];
  const visit = (id: number): void => {
    state.set(id, 1);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const s = state.get(next);
      if (s === 1) throw new SymbolCycleError([...stack.slice(stack.indexOf(next)), next]);
      if (s === undefined) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const [id] of timelines) if (state.get(id) === undefined) visit(id);

  // Class links on non-sprites.
  for (const id of [...classById.keys()].sort((a, b) => a - b)) {
    if (id !== 0 && !spriteById.has(id)) {
      warnings.push(`symbolClass: id ${id} (${classById.get(id)}) is not a sprite; class link ignored`);
    }
  }

  // Unbound instance names (Requirement 8.7).
  for (const [id] of timelines) {
    const className = classById.get(id);
    if (className === undefined) continue;
    const props = propsByClass.get(className);
    if (props === undefined || props === null) continue;
    const declared = new Set(props);
    const names = new Set<string>();
    for (const frame of (symbols[String(id)] as SpriteSymbol).frames) {
      for (const e of frame) if (e.name !== '' && !declared.has(e.name)) names.add(e.name);
    }
    for (const name of [...names].sort(cmpStr)) {
      unsupported.push({
        kind: 'unbound-instance',
        id,
        message: `instance ${name} has no property in class ${className}`,
      });
    }
  }

  const scene: SceneJson = {
    formatVersion: 2,
    stage: {
      width: model.header.widthPx,
      height: model.header.heightPx,
      backgroundColor: colourHex(model.background),
      frameRate: model.header.frameRate,
    },
    rootSymbolId: 0,
    symbols,
  };
  validateScene(scene);

  shapeFiles.sort((a, b) => parseInt(a.fileName, 10) - parseInt(b.fileName, 10));
  const imageFiles = [...images.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  return {
    scene,
    shapeFiles,
    imageFiles,
    unsupported: sortUnsupported(unsupported),
    warnings: [...warnings].sort(cmpStr),
    stats: { svgWritten: shapeFiles.length, morphSkipped: morphIds.length, declaredShapes: shapeIds.length + morphIds.length },
  };
}
