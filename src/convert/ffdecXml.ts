import { XMLParser } from 'fast-xml-parser';
import { MissingHeaderValueError, XmlVersionError } from '../unpack/errors';
import type {
  ColorTransformModel,
  MatrixModel,
  SpriteModel,
  TimelineModel,
  TimelineOp,
  UnsupportedKind,
  UnsupportedObservation,
} from './model';

// FFDec XML element and attribute names. Verified against the dump of
// samples/clickgoto/test.swf (test/fixtures/clickgoto/structure.xml), FFDec 26.4.0,
// _xmlExportMajor=4, _xmlExportMinor=2. Line numbers refer to that fixture.
// Names marked UNVERIFIED do not occur in the sample; they come from FFDec's documented
// class names and must be confirmed on a real SWF before being relied on.

// SVG origin sign: each exported shape SVG wraps its paths in <g transform="matrix(1.0, 0.0, 0.0, 1.0, tx, ty)">.
// Drawing the SVG at (-tx, -ty) puts the shape's own origin at the node origin. See
// test/fixtures/clickgoto/FINDINGS.md, section "Task 2.3". Also there: use the ShowFrameTag count,
// not the sprite frameCount attribute, as the real frame count.

/** Verified on FFDec 26.4.0: the sample dump has _xmlExportMajor="4" (structure.xml line 5). */
export const SUPPORTED_XML_MAJOR = 4;

export const FFDEC_XML = {
  root: {
    /** Verified on FFDec 26.4.0 (line 5): root element name. */
    element: 'swf',
    /** Verified on FFDec 26.4.0 (line 5): root attribute. */
    exportMajor: '_xmlExportMajor',
    /** Verified on FFDec 26.4.0 (line 5): root attribute. */
    exportMinor: '_xmlExportMinor',
    /** Verified on FFDec 26.4.0 (line 5): root attribute, plain decimal string ("24.0"), not fixed-point. */
    frameRate: 'frameRate',
    /** Verified on FFDec 26.4.0 (line 5): root attribute, root timeline frame count ("3"). */
    frameCount: 'frameCount',
    /** Verified on FFDec 26.4.0 (line 6): CHILD element of root (not an attribute), holds the stage RECT. */
    displayRect: 'displayRect',
    /** Verified on FFDec 26.4.0 (line 6): attributes of displayRect, integer twips. Width px = (Xmax - Xmin) / 20. */
    rectXmin: 'Xmin',
    /** Verified on FFDec 26.4.0 (line 6). */
    rectXmax: 'Xmax',
    /** Verified on FFDec 26.4.0 (line 6). */
    rectYmin: 'Ymin',
    /** Verified on FFDec 26.4.0 (line 6). */
    rectYmax: 'Ymax',
    /** Verified on FFDec 26.4.0 (line 7): container element holding the root tag list. */
    tags: 'tags',
  },

  item: {
    /** Verified on FFDec 26.4.0 (lines 8-9, 81): every tag is an <item> whose `type` attribute names the tag class. */
    element: 'item',
    /** Verified on FFDec 26.4.0 (line 8). */
    kindAttr: 'type',
  },

  fileAttributes: {
    /** Verified on FFDec 26.4.0 (line 8). */
    tag: 'FileAttributesTag',
    /** Verified on FFDec 26.4.0 (line 8): attribute value "true" for an AS3 SWF. */
    as3Flag: 'actionScript3',
  },

  background: {
    /** Verified on FFDec 26.4.0 (line 9). */
    tag: 'SetBackgroundColorTag',
    /** Verified on FFDec 26.4.0 (line 10): child element, type="RGB". */
    colorChild: 'backgroundColor',
    /** Verified on FFDec 26.4.0 (line 10): integer attributes 0..255. */
    red: 'red',
    /** Verified on FFDec 26.4.0 (line 10). */
    green: 'green',
    /** Verified on FFDec 26.4.0 (line 10). */
    blue: 'blue',
  },

  shape: {
    /** Verified on FFDec 26.4.0 (line 23): the only shape definition tag present in the sample. */
    defineShape4: 'DefineShape4Tag',
    /** UNVERIFIED (not in sample; FFDec class name). */
    defineShape: 'DefineShapeTag',
    /** UNVERIFIED (not in sample; FFDec class name). */
    defineShape2: 'DefineShape2Tag',
    /** UNVERIFIED (not in sample; FFDec class name). */
    defineShape3: 'DefineShape3Tag',
    /** Verified on FFDec 26.4.0 (line 23) for DefineShape4Tag: the id attribute is `shapeId`. UNVERIFIED for the other variants. */
    idAttr: 'shapeId',
    /** Verified on FFDec 26.4.0 (line 25): child element, RECT in twips (Xmin/Xmax/Ymin/Ymax). */
    shapeBounds: 'shapeBounds',
  },

  morph: {
    /** UNVERIFIED (not in sample; FFDec class name). */
    defineMorphShape: 'DefineMorphShapeTag',
    /** UNVERIFIED (not in sample; FFDec class name). */
    defineMorphShape2: 'DefineMorphShape2Tag',
    /** UNVERIFIED (not in sample): id attribute name assumed `characterId`. */
    idAttr: 'characterId',
  },

  /** Tag name -> unsupported kind. Every key is UNVERIFIED (none occur in the sample; FFDec class names). */
  unsupportedKinds: {
    /** UNVERIFIED */ DefineTextTag: 'text',
    /** UNVERIFIED */ DefineText2Tag: 'text',
    /** UNVERIFIED */ DefineEditTextTag: 'text',
    /** UNVERIFIED */ DefineSoundTag: 'sound',
    /** UNVERIFIED */ SoundStreamHeadTag: 'sound',
    /** UNVERIFIED */ SoundStreamHead2Tag: 'sound',
    /** UNVERIFIED */ DefineButtonTag: 'button',
    /** UNVERIFIED */ DefineButton2Tag: 'button',
    /** UNVERIFIED */ DefineVideoStreamTag: 'video',
  },

  sprite: {
    /** Verified on FFDec 26.4.0 (line 79). */
    tag: 'DefineSpriteTag',
    /** Verified on FFDec 26.4.0 (line 79): the sprite id attribute is `spriteId` (not characterId). */
    idAttr: 'spriteId',
    /** Verified on FFDec 26.4.0 (line 79): declared sprite frame count attribute. */
    frameCountAttr: 'frameCount',
    /** Verified on FFDec 26.4.0 (line 80): child element holding the sprite's tags as <item>s. */
    subTags: 'subTags',
  },

  timeline: {
    /** Verified on FFDec 26.4.0 (line 84): ends a frame, both in sprites and at root. */
    showFrame: 'ShowFrameTag',
    /** Verified on FFDec 26.4.0 (tweendemo fixture structure.xml lines 1120, 1236, 1337): tag name; labels start, middle, gone. */
    frameLabel: 'FrameLabelTag',
    /** Verified on FFDec 26.4.0 (tweendemo fixture lines 1120, 1236, 1337): label name attribute. */
    frameLabelNameAttr: 'name',
    /**
     * Verified on FFDec 26.4.0 (lines 13-22): this tag exists, with <frameNums/> and <frameNames/> children
     * (empty in the sample). Whether labels appear there instead of FrameLabelTag is UNVERIFIED.
     */
    sceneAndLabelData: 'DefineSceneAndFrameLabelDataTag',
  },

  place: {
    /** Verified on FFDec 26.4.0 (line 81). */
    placeObject2: 'PlaceObject2Tag',
    /** UNVERIFIED (not in sample; FFDec class name). */
    placeObject: 'PlaceObjectTag',
    /** UNVERIFIED (not in sample; FFDec class name). */
    placeObject3: 'PlaceObject3Tag',
    /** Verified on FFDec 26.4.0 (line 81): attribute, present only when placeFlagHasCharacter is true. */
    characterId: 'characterId',
    /** Verified on FFDec 26.4.0 (line 81). */
    depth: 'depth',
    /** Verified on FFDec 26.4.0 (line 155): attribute, present only when placeFlagHasName is true. */
    name: 'name',
    /** Verified on FFDec 26.4.0 (line 85): "true" with characterId present means replace the character at the depth. */
    flagMove: 'placeFlagMove',
    /** Verified on FFDec 26.4.0 (line 81). */
    flagHasCharacter: 'placeFlagHasCharacter',
    /** Verified on FFDec 26.4.0 (line 81). */
    flagHasMatrix: 'placeFlagHasMatrix',
    /** Verified on FFDec 26.4.0 (line 81). */
    flagHasColorTransform: 'placeFlagHasColorTransform',
    /** Verified on FFDec 26.4.0 (line 81). */
    flagHasName: 'placeFlagHasName',
    /** Verified on FFDec 26.4.0 (line 81): flag only. The clip depth VALUE attribute `clipDepth` is UNVERIFIED. */
    flagHasClipDepth: 'placeFlagHasClipDepth',
    /** UNVERIFIED (not in sample; FFDec field name). */
    clipDepth: 'clipDepth',
    /** Verified on FFDec 26.4.0 (line 81): flag on PlaceObject2Tag. Ratio is not used by the pipeline. */
    flagHasRatio: 'placeFlagHasRatio',
    /** UNVERIFIED (PlaceObject3Tag only; FFDec field name). */
    flagHasFilterList: 'placeFlagHasFilterList',
    /** UNVERIFIED (PlaceObject3Tag only; FFDec field name). */
    surfaceFilterList: 'surfaceFilterList',
  },

  remove: {
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1338, depth="10"; the only attribute besides forceWriteAsLong). */
    removeObject2: 'RemoveObject2Tag',
    /** UNVERIFIED (not in either fixture; FFDec class name). Fields assumed `characterId` and `depth`. */
    removeObject: 'RemoveObjectTag',
    /** Verified on FFDec 26.4.0 for RemoveObject2Tag (tweendemo fixture line 1338). UNVERIFIED for RemoveObjectTag. */
    depth: 'depth',
  },

  matrix: {
    /** Verified on FFDec 26.4.0 (line 82): child element of the placement, type="MATRIX". Absent when placeFlagHasMatrix is false (line 85). */
    element: 'matrix',
    /** Verified on FFDec 26.4.0 (line 156): integer twips (2870 = 143.5 px). Divide by 20. */
    translateX: 'translateX',
    /** Verified on FFDec 26.4.0 (line 156): integer twips (5400 = 270 px). */
    translateY: 'translateY',
    /** Verified on FFDec 26.4.0 (line 82): flag; when "false" the scale attributes are omitted (identity scale 1,1). */
    hasScale: 'hasScale',
    /** Verified on FFDec 26.4.0 (line 82): flag; when "false" the rotate/skew attributes are omitted (0,0). */
    hasRotate: 'hasRotate',
    /**
     * Verified on FFDec 26.4.0 (tweendemo fixture lines 1122 to 1333, e.g. 1122 scaleX="0.59999084", 1333 scaleX="-1.3999939"):
     * a PLAIN DECIMAL, used as is (no division). Omitted when hasScale is false (clickgoto fixture line 82).
     */
    scaleX: 'scaleX',
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1122, 1333): plain decimal, as scaleX. */
    scaleY: 'scaleY',
    /** Verified on FFDec 26.4.0 (tweendemo fixture lines 1122, 1127 rotateSkew0="0.04624939"): plain decimal, used as is. Omitted when hasRotate is false. */
    rotateSkew0: 'rotateSkew0',
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1127 rotateSkew1="-0.04624939"): plain decimal, as rotateSkew0. */
    rotateSkew1: 'rotateSkew1',
  },

  colorTransform: {
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1123, type="CXFORMWITHALPHA"): child element of the placement. */
    element: 'colorTransform',
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1123, "256"): integer in 1/256 units, divided by 256. */
    redMultTerm: 'redMultTerm',
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1123): as redMultTerm. */
    greenMultTerm: 'greenMultTerm',
    /** Verified on FFDec 26.4.0 (tweendemo fixture line 1123): as redMultTerm. */
    blueMultTerm: 'blueMultTerm',
    /** Verified on FFDec 26.4.0 (tweendemo fixture lines 1123 "256", 1128 "252", 1334 "77"): as redMultTerm. */
    alphaMultTerm: 'alphaMultTerm',
    /** UNVERIFIED: add-term names never occur in the fixtures (hasAddTerms="false" everywhere). */
    redAddTerm: 'redAddTerm',
    /** UNVERIFIED */
    greenAddTerm: 'greenAddTerm',
    /** UNVERIFIED */
    blueAddTerm: 'blueAddTerm',
    /** UNVERIFIED */
    alphaAddTerm: 'alphaAddTerm',
  },

  symbolClass: {
    /** Verified on FFDec 26.4.0 (line 1108). The csv export is the pipeline's source; this tag is the structure-dump cross-check. */
    tag: 'SymbolClassTag',
    /** Verified on FFDec 26.4.0 (line 1109): list of <item>ids</item>; id 0 is the root. */
    ids: 'tags',
    /** Verified on FFDec 26.4.0 (line 1114): list of <item>class names</item>, parallel to `tags`. */
    names: 'names',
  },
} as const;

// ---------------------------------------------------------------------------
// Dump header (Requirements 2.2, 2.6, 2.9, 2.10). Pure: no node:fs / child_process.
// ---------------------------------------------------------------------------

/** Stage and root-timeline facts read from the root element of the swf2xml dump. */
export interface SwfHeader {
  widthPx: number;
  heightPx: number;
  frameRate: number;
  frameCount: number;
}

export interface XmlVersion {
  major: number;
  minor: number;
}

const TWIPS_PER_PIXEL = 20;

function finiteNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Reads the XML export version and the header values from the root element of a swf2xml dump.
 * Only the head of the document (up to the root tag list) is parsed.
 * @throws XmlVersionError when `_xmlExportMajor` is missing or unreadable.
 * @throws MissingHeaderValueError naming each of frameRate, frameCount, stageRect that is missing or not finite.
 */
export function readDumpHeader(xmlText: string): { xmlVersion: XmlVersion; header: SwfHeader } {
  const r = FFDEC_XML.root;
  const tagsAt = xmlText.indexOf(`<${r.tags}`);
  const head = tagsAt >= 0 ? `${xmlText.slice(0, tagsAt)}</${r.element}>` : xmlText;
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false });
  let root: Record<string, unknown> | undefined;
  try {
    const parsed = parser.parse(head) as Record<string, unknown>;
    root = parsed[r.element] as Record<string, unknown> | undefined;
  } catch {
    root = undefined;
  }
  const attr = (name: string): unknown => (root && typeof root === 'object' ? root[`@_${name}`] : undefined);

  const major = finiteNumber(attr(r.exportMajor));
  if (major === undefined) throw new XmlVersionError('missing', String(SUPPORTED_XML_MAJOR));
  const minor = finiteNumber(attr(r.exportMinor)) ?? 0;

  const missing: string[] = [];
  const frameRate = finiteNumber(attr(r.frameRate));
  if (frameRate === undefined) missing.push('frameRate');
  const frameCount = finiteNumber(attr(r.frameCount));
  if (frameCount === undefined) missing.push('frameCount');

  const rect = root && typeof root === 'object' ? (root[r.displayRect] as Record<string, unknown> | undefined) : undefined;
  const get = (name: string): number | undefined =>
    rect && typeof rect === 'object' ? finiteNumber(rect[`@_${name}`]) : undefined;
  const xMin = get(r.rectXmin);
  const xMax = get(r.rectXmax);
  const yMin = get(r.rectYmin);
  const yMax = get(r.rectYmax);
  if (xMin === undefined || xMax === undefined || yMin === undefined || yMax === undefined) {
    missing.push('stageRect');
  }

  if (missing.length > 0) throw new MissingHeaderValueError(missing);

  return {
    xmlVersion: { major, minor },
    header: {
      widthPx: ((xMax as number) - (xMin as number)) / TWIPS_PER_PIXEL,
      heightPx: ((yMax as number) - (yMin as number)) / TWIPS_PER_PIXEL,
      frameRate: frameRate as number,
      frameCount: frameCount as number,
    },
  };
}

/** Throws `XmlVersionError(found, supported)` when the major version is not `SUPPORTED_XML_MAJOR`. */
export function checkXmlVersion(version: XmlVersion): void {
  if (version.major !== SUPPORTED_XML_MAJOR) {
    throw new XmlVersionError(`${version.major}.${version.minor}`, String(SUPPORTED_XML_MAJOR));
  }
}

/** True when the head of the dump holds a FileAttributesTag item with the ActionScript 3 flag set to true. */
export function isAs3Dump(xmlHead: string): boolean {
  const f = FFDEC_XML.fileAttributes;
  const item = new RegExp(`<${FFDEC_XML.item.element}\\b[^>]*\\b${FFDEC_XML.item.kindAttr}="${f.tag}"[^>]*>`).exec(xmlHead);
  if (!item) return false;
  return new RegExp(`\\b${f.as3Flag}="true"`).test(item[0]);
}

// ---------------------------------------------------------------------------
// Structure parsing (Requirements 3.7, 4.3, 4.4, 4.9). Pure.
// ---------------------------------------------------------------------------

type PNode = Record<string, unknown>;

const ATTR = ':@';
const PREFIX = '@_';

function attrsOf(node: PNode): Record<string, string> {
  const a = node[ATTR];
  return a && typeof a === 'object' ? (a as Record<string, string>) : {};
}
function childrenOf(node: PNode, tag: string): PNode[] {
  const c = node[tag];
  return Array.isArray(c) ? (c as PNode[]) : [];
}
/** Element name of a preserveOrder node (the single key other than the attribute bag). */
function nameOf(node: PNode): string | undefined {
  return Object.keys(node).find((k) => k !== ATTR && k !== '#text');
}
function findChild(node: PNode, tag: string, childName: string): { attrs: Record<string, string>; node: PNode } | undefined {
  for (const ch of childrenOf(node, tag)) {
    if (nameOf(ch) === childName) return { attrs: attrsOf(ch), node: ch };
  }
  return undefined;
}
const attrNum = (a: Record<string, string>, key: string): number | undefined => finiteNumber(a[`${PREFIX}${key}`]);
const attrStr = (a: Record<string, string>, key: string): string | undefined => a[`${PREFIX}${key}`];
const attrBool = (a: Record<string, string>, key: string): boolean => attrStr(a, key) === 'true';

const CXFORM_UNIT = 256;

function parseMatrix(attrs: Record<string, string>): MatrixModel {
  const m = FFDEC_XML.matrix;
  const hasScale = attrBool(attrs, m.hasScale);
  const hasRotate = attrBool(attrs, m.hasRotate);
  return {
    a: hasScale ? (attrNum(attrs, m.scaleX) ?? 1) : 1,
    b: hasRotate ? (attrNum(attrs, m.rotateSkew0) ?? 0) : 0,
    c: hasRotate ? (attrNum(attrs, m.rotateSkew1) ?? 0) : 0,
    d: hasScale ? (attrNum(attrs, m.scaleY) ?? 1) : 1,
    txTwips: attrNum(attrs, m.translateX) ?? 0,
    tyTwips: attrNum(attrs, m.translateY) ?? 0,
  };
}

function parseColorTransform(attrs: Record<string, string>): ColorTransformModel {
  const c = FFDEC_XML.colorTransform;
  const mul = (k: string): number => (attrNum(attrs, k) ?? CXFORM_UNIT) / CXFORM_UNIT;
  const add = (k: string): number => attrNum(attrs, k) ?? 0;
  return {
    mul: [mul(c.redMultTerm), mul(c.greenMultTerm), mul(c.blueMultTerm), mul(c.alphaMultTerm)],
    add: [add(c.redAddTerm), add(c.greenAddTerm), add(c.blueAddTerm), add(c.alphaAddTerm)],
  };
}

interface ParseCtx {
  unsupported: UnsupportedObservation[];
}

const KNOWN_PLACE_TAGS: ReadonlySet<string> = new Set([
  FFDEC_XML.place.placeObject,
  FFDEC_XML.place.placeObject2,
  FFDEC_XML.place.placeObject3,
]);

function parsePlace(item: PNode, kind: string, ctx: ParseCtx): TimelineOp | undefined {
  const p = FFDEC_XML.place;
  const attrs = attrsOf(item);
  const depth = attrNum(attrs, p.depth);
  if (!KNOWN_PLACE_TAGS.has(kind) || depth === undefined) {
    ctx.unsupported.push({ kind: 'other-tag', tagName: kind });
    return undefined;
  }
  const op: Extract<TimelineOp, { kind: 'place' }> = {
    kind: 'place',
    depth,
    move: attrBool(attrs, p.flagMove),
  };
  const characterId = attrNum(attrs, p.characterId);
  if (characterId !== undefined) op.characterId = characterId;
  const matrix = findChild(item, FFDEC_XML.item.element, FFDEC_XML.matrix.element);
  if (matrix) op.matrix = parseMatrix(matrix.attrs);
  const ct = findChild(item, FFDEC_XML.item.element, FFDEC_XML.colorTransform.element);
  if (ct) op.colorTransform = parseColorTransform(ct.attrs);
  const name = attrStr(attrs, p.name);
  if (name !== undefined) op.name = name;
  if (attrBool(attrs, p.flagHasClipDepth)) {
    const cd = attrNum(attrs, p.clipDepth);
    if (cd !== undefined) op.clipDepth = cd;
  }
  if (attrBool(attrs, p.flagHasFilterList)) op.hasFilters = true;
  return op;
}

const REMOVE_TAGS: ReadonlySet<string> = new Set([FFDEC_XML.remove.removeObject, FFDEC_XML.remove.removeObject2]);
const SHAPE_TAGS: ReadonlySet<string> = new Set([
  FFDEC_XML.shape.defineShape,
  FFDEC_XML.shape.defineShape2,
  FFDEC_XML.shape.defineShape3,
  FFDEC_XML.shape.defineShape4,
]);
const MORPH_TAGS: ReadonlySet<string> = new Set([FFDEC_XML.morph.defineMorphShape, FFDEC_XML.morph.defineMorphShape2]);
const IGNORED_DEFINE_TAGS: ReadonlySet<string> = new Set([FFDEC_XML.timeline.sceneAndLabelData]);

function readTimelineOp(item: PNode, kind: string, ctx: ParseCtx): TimelineOp | undefined {
  const attrs = attrsOf(item);
  if (kind === FFDEC_XML.timeline.showFrame) return { kind: 'showFrame' };
  if (kind === FFDEC_XML.timeline.frameLabel) {
    const name = attrStr(attrs, FFDEC_XML.timeline.frameLabelNameAttr);
    return name === undefined ? undefined : { kind: 'label', name };
  }
  if (REMOVE_TAGS.has(kind)) {
    const depth = attrNum(attrs, FFDEC_XML.remove.depth);
    if (depth === undefined) {
      ctx.unsupported.push({ kind: 'other-tag', tagName: kind });
      return undefined;
    }
    const op: Extract<TimelineOp, { kind: 'remove' }> = { kind: 'remove', depth };
    const cid = attrNum(attrs, FFDEC_XML.place.characterId);
    if (cid !== undefined) op.characterId = cid;
    return op;
  }
  if (kind.startsWith('PlaceObject')) return parsePlace(item, kind, ctx);
  return undefined;
}

/**
 * Parses the structure dump: background, root timeline, sprites, shape ids and unsupported observations.
 * Matrix translations stay in twips. Root `declaredFrameCount` comes from the root header; a sprite's from its
 * frame count attribute.
 */
export function parseStructure(xmlText: string): {
  background: { r: number; g: number; b: number } | null;
  root: TimelineModel;
  sprites: SpriteModel[];
  declaredShapeIds: number[];
  morphShapeIds: number[];
  unsupported: UnsupportedObservation[];
} {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: PREFIX,
    parseAttributeValue: false,
    parseTagValue: false,
  });
  const doc = parser.parse(xmlText) as PNode[];
  const swf = doc.find((n) => nameOf(n) === FFDEC_XML.root.element);
  const ctx: ParseCtx = { unsupported: [] };
  const out = {
    background: null as { r: number; g: number; b: number } | null,
    root: { declaredFrameCount: null as number | null, ops: [] as TimelineOp[] },
    sprites: [] as SpriteModel[],
    declaredShapeIds: [] as number[],
    morphShapeIds: [] as number[],
    unsupported: ctx.unsupported,
  };
  if (!swf) return out;
  out.root.declaredFrameCount = attrNum(attrsOf(swf), FFDEC_XML.root.frameCount) ?? null;

  const tagsNode = childrenOf(swf, FFDEC_XML.root.element).find((n) => nameOf(n) === FFDEC_XML.root.tags);
  const items = tagsNode ? childrenOf(tagsNode, FFDEC_XML.root.tags) : [];
  for (const item of items) {
    if (nameOf(item) !== FFDEC_XML.item.element) continue;
    const attrs = attrsOf(item);
    const kind = attrStr(attrs, FFDEC_XML.item.kindAttr);
    if (kind === undefined) continue;

    if (kind === FFDEC_XML.background.tag) {
      const c = findChild(item, FFDEC_XML.item.element, FFDEC_XML.background.colorChild);
      if (c) {
        out.background = {
          r: attrNum(c.attrs, FFDEC_XML.background.red) ?? 0,
          g: attrNum(c.attrs, FFDEC_XML.background.green) ?? 0,
          b: attrNum(c.attrs, FFDEC_XML.background.blue) ?? 0,
        };
      }
    } else if (kind === FFDEC_XML.sprite.tag) {
      const id = attrNum(attrs, FFDEC_XML.sprite.idAttr);
      if (id === undefined) {
        ctx.unsupported.push({ kind: 'other-tag', tagName: kind });
        continue;
      }
      const sub = findChild(item, FFDEC_XML.item.element, FFDEC_XML.sprite.subTags);
      const subItems = sub ? childrenOf(sub.node, FFDEC_XML.sprite.subTags) : [];
      out.sprites.push({
        id,
        declaredFrameCount: attrNum(attrs, FFDEC_XML.sprite.frameCountAttr) ?? null,
        ops: collectOps(subItems, ctx),
      });
    } else if (SHAPE_TAGS.has(kind)) {
      const id = attrNum(attrs, FFDEC_XML.shape.idAttr);
      if (id !== undefined) out.declaredShapeIds.push(id);
      else ctx.unsupported.push({ kind: 'other-tag', tagName: kind });
    } else if (MORPH_TAGS.has(kind)) {
      const id = attrNum(attrs, FFDEC_XML.morph.idAttr);
      if (id !== undefined) out.morphShapeIds.push(id);
      ctx.unsupported.push(id !== undefined ? { kind: 'morph-shape', tagName: kind, characterId: id } : { kind: 'morph-shape', tagName: kind });
    } else if (kind in FFDEC_XML.unsupportedKinds) {
      const k = FFDEC_XML.unsupportedKinds[kind as keyof typeof FFDEC_XML.unsupportedKinds] as UnsupportedKind;
      ctx.unsupported.push({ kind: k, tagName: kind });
    } else if (IGNORED_DEFINE_TAGS.has(kind)) {
      // known, nothing to read
    } else if (kind.startsWith('Define')) {
      ctx.unsupported.push({ kind: 'other-tag', tagName: kind });
    } else {
      const op = readTimelineOp(item, kind, ctx);
      if (op) out.root.ops.push(op);
    }
  }
  return out;
}

function collectOps(items: PNode[], ctx: ParseCtx): TimelineOp[] {
  const ops: TimelineOp[] = [];
  for (const item of items) {
    if (nameOf(item) !== FFDEC_XML.item.element) continue;
    const kind = attrStr(attrsOf(item), FFDEC_XML.item.kindAttr);
    if (kind === undefined) continue;
    const op = readTimelineOp(item, kind, ctx);
    if (op) ops.push(op);
  }
  return ops;
}