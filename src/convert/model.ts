// Plain-data model produced by the converter IO reader and consumed by the pure converter.
// Types only; JSON-serialisable; no classes, Map or Date.
import type { SwfHeader } from './ffdecXml';

export interface TagsModel {
  xmlVersion: { major: number; minor: number };
  header: SwfHeader; // from the swf2xml dump root element (readDumpHeader)
  background: { r: number; g: number; b: number } | null; // null = tag absent -> #ffffff
  root: TimelineModel; // symbol id 0; declaredFrameCount = header.frameCount
  sprites: SpriteModel[]; // any order; converter sorts by id
  declaredShapeIds: number[]; // character ids of shape definition tags (non-morph)
  morphShapeIds: number[]; // character ids of morph shape definition tags
  shapeAssets: ShapeAssetModel[]; // one per file found under shapes/
  symbolClasses: SymbolClassEntry[]; // from symbols.csv
  classSources: ClassSourceModel[];
  unsupported: UnsupportedObservation[]; // tags seen but not handled
}

export interface TimelineModel {
  declaredFrameCount: number | null;
  ops: TimelineOp[];
}
export interface SpriteModel extends TimelineModel {
  id: number;
}

export type TimelineOp =
  | {
      kind: 'place';
      depth: number;
      characterId?: number;
      move: boolean;
      matrix?: MatrixModel;
      colorTransform?: ColorTransformModel;
      name?: string;
      clipDepth?: number;
      hasFilters?: boolean;
    }
  | { kind: 'remove'; depth: number; characterId?: number }
  | { kind: 'label'; name: string }
  | { kind: 'showFrame' };

export interface MatrixModel {
  a: number;
  b: number;
  c: number;
  d: number;
  txTwips: number;
  tyTwips: number;
}
export interface ColorTransformModel {
  mul: [number, number, number, number]; // r g b a
  add: [number, number, number, number];
}

export interface ShapeAssetModel {
  id: number;
  svg: string | null; // null = no file; "" = zero-byte file
  origin: { x: number; y: number } | null; // from extractSvgOrigin; px
}
export interface SymbolClassEntry {
  id: number; // 0 = root
  className: string;
}
export interface ClassSourceModel {
  className: string;
  properties: string[] | null; // null = source file absent
}

export type UnsupportedKind =
  | 'text'
  | 'sound'
  | 'button'
  | 'filter'
  | 'mask'
  | 'video'
  | 'morph-shape'
  | 'unbound-instance'
  | 'untranslated-class'
  | 'other-tag';
export interface UnsupportedObservation {
  kind: UnsupportedKind;
  tagName: string;
  characterId?: number;
}
