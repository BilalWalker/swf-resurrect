import { XMLParser } from 'fast-xml-parser';
import { MissingHeaderValueError, XmlVersionError } from '../unpack/errors';

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
    /** UNVERIFIED (not in sample; FFDec class name). Label name attribute `name` is also UNVERIFIED. */
    frameLabel: 'FrameLabelTag',
    /** UNVERIFIED (not in sample). */
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
    /** UNVERIFIED (not in sample; FFDec class name). Fields assumed `depth`. */
    removeObject2: 'RemoveObject2Tag',
    /** UNVERIFIED (not in sample; FFDec class name). Fields assumed `characterId` and `depth`. */
    removeObject: 'RemoveObjectTag',
    /** UNVERIFIED (not in sample). */
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
    /** UNVERIFIED (hasScale is false everywhere in the sample; FFDec field name). Fixed-point 16.16 assumed, divide by 65536. */
    scaleX: 'scaleX',
    /** UNVERIFIED (as scaleX). */
    scaleY: 'scaleY',
    /** UNVERIFIED (hasRotate is false everywhere in the sample; FFDec field name). Fixed-point 16.16 assumed. */
    rotateSkew0: 'rotateSkew0',
    /** UNVERIFIED (as rotateSkew0). */
    rotateSkew1: 'rotateSkew1',
  },

  colorTransform: {
    /** UNVERIFIED (placeFlagHasColorTransform is false everywhere in the sample): child element name on a placement. */
    element: 'colorTransform',
    /** UNVERIFIED: FFDec CXFORMWITHALPHA field names; multipliers expected as integers in 1/256 units, terms as integers. */
    redMultTerm: 'redMultTerm',
    /** UNVERIFIED */
    greenMultTerm: 'greenMultTerm',
    /** UNVERIFIED */
    blueMultTerm: 'blueMultTerm',
    /** UNVERIFIED */
    alphaMultTerm: 'alphaMultTerm',
    /** UNVERIFIED */
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
