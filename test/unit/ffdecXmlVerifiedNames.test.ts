import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FFDEC_XML, parseStructure } from '../../src/convert/ffdecXml';

const xml = readFileSync('test/fixtures/tweendemo/structure.xml', 'utf8');
const lines = xml.split(/\r?\n/);

/** True when the 1-based fixture line contains the text. */
const lineHas = (n: number, text: string): boolean => (lines[n - 1] ?? '').includes(text);

describe('FFDEC_XML names marked verified occur in the tweendemo fixture', () => {
  it('matrix scale and skew attributes (lines 1122, 1127, 1333)', () => {
    const m = FFDEC_XML.matrix;
    expect(lineHas(1122, `${m.scaleX}="`)).toBe(true);
    expect(lineHas(1122, `${m.scaleY}="`)).toBe(true);
    expect(lineHas(1127, `${m.rotateSkew0}="`)).toBe(true);
    expect(lineHas(1127, `${m.rotateSkew1}="`)).toBe(true);
    expect(lineHas(1333, `${m.scaleX}="-1.3999939"`)).toBe(true);
  });

  it('colorTransform element and multiplier terms (lines 1123, 1334)', () => {
    const c = FFDEC_XML.colorTransform;
    expect(lineHas(1123, `<${c.element} `)).toBe(true);
    for (const k of [c.redMultTerm, c.greenMultTerm, c.blueMultTerm, c.alphaMultTerm]) {
      expect(lineHas(1123, `${k}="256"`)).toBe(true);
    }
    expect(lineHas(1334, `${c.alphaMultTerm}="77"`)).toBe(true);
  });

  it('add-term names do not occur (stay UNVERIFIED)', () => {
    const c = FFDEC_XML.colorTransform;
    for (const k of [c.redAddTerm, c.greenAddTerm, c.blueAddTerm, c.alphaAddTerm]) {
      expect(xml.includes(`${k}=`)).toBe(false);
    }
  });

  it('FrameLabelTag with name attribute (lines 1120, 1236, 1337)', () => {
    const t = FFDEC_XML.timeline;
    expect(lineHas(1120, `type="${t.frameLabel}"`)).toBe(true);
    expect(lineHas(1120, `${t.frameLabelNameAttr}="start"`)).toBe(true);
    expect(lineHas(1236, `${t.frameLabelNameAttr}="middle"`)).toBe(true);
    expect(lineHas(1337, `${t.frameLabelNameAttr}="gone"`)).toBe(true);
  });

  it('RemoveObject2Tag with depth attribute (line 1338)', () => {
    expect(lineHas(1338, `type="${FFDEC_XML.remove.removeObject2}"`)).toBe(true);
    expect(lineHas(1338, `${FFDEC_XML.remove.depth}="10"`)).toBe(true);
  });

  it('names left UNVERIFIED do not occur in the fixture', () => {
    expect(xml.includes(`"${FFDEC_XML.remove.removeObject}"`)).toBe(false);
    expect(xml.includes(`"${FFDEC_XML.place.placeObject}"`)).toBe(false);
    expect(xml.includes(`"${FFDEC_XML.place.placeObject3}"`)).toBe(false);
    expect(xml.includes(`${FFDEC_XML.place.clipDepth}="`)).toBe(false);
    expect(xml.includes(FFDEC_XML.place.surfaceFilterList)).toBe(false);
  });
});

describe('colour transform multipliers through parseStructure', () => {
  it('divides multiplier terms by 256 (256 -> 1, 77 -> about 0.30)', () => {
    const dump = [
      '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="1" frameRate="24.0">',
      '<tags>',
      '<item type="PlaceObject2Tag" characterId="1" depth="10" placeFlagHasCharacter="true" placeFlagHasColorTransform="true" placeFlagMove="false">',
      '<colorTransform type="CXFORMWITHALPHA" alphaMultTerm="77" blueMultTerm="256" greenMultTerm="256" hasAddTerms="false" hasMultTerms="true" nbits="10" redMultTerm="256"/>',
      '</item>',
      '<item type="ShowFrameTag"/>',
      '</tags>',
      '</swf>',
    ].join('\n');
    const op = parseStructure(dump).root.ops.find((o) => o.kind === 'place');
    if (!op || op.kind !== 'place' || !op.colorTransform) throw new Error('no colour transform parsed');
    expect(op.colorTransform.mul[0]).toBe(1);
    expect(op.colorTransform.mul[1]).toBe(1);
    expect(op.colorTransform.mul[2]).toBe(1);
    expect(op.colorTransform.mul[3]).toBeCloseTo(0.3008, 3);
    expect(op.colorTransform.add).toEqual([0, 0, 0, 0]);
  });
});

describe('3.3 observed id names are verified, unobserved ones stay UNVERIFIED', () => {
  const src = readFileSync('src/convert/ffdecXml.ts', 'utf8');
  /** The comment line directly above the first line that mentions the quoted tag name. */
  const markOf = (tag: string): string => {
    const quoted = src.indexOf(`'${tag}'`);
    const at = quoted >= 0 ? quoted : src.indexOf(`${tag}:`);
    return src.slice(src.lastIndexOf('/**', at), at);
  };
  it('observed tags carry no UNVERIFIED mark', () => {
    for (const t of ['DefineTextTag', 'DefineEditTextTag', 'DefineButton2Tag', 'DefineBitsTag', 'DefineBitsJPEG3Tag', 'DefineBitsLosslessTag', 'DefineBitsLossless2Tag', 'DefineShapeTag', 'DefineShape2Tag', 'DefineShape3Tag']) {
      expect(markOf(t), t).not.toContain('UNVERIFIED');
    }
  });
  it('the six unobserved names are still UNVERIFIED', () => {
    for (const t of ['DefineText2Tag', 'DefineButtonTag', 'DefineSoundTag', 'SoundStreamHeadTag', 'SoundStreamHead2Tag', 'DefineVideoStreamTag']) {
      expect(markOf(t), t).toContain('UNVERIFIED');
    }
  });
  it('id attribute names', () => {
    expect(FFDEC_XML.staticText.idAttr).toBe('characterID');
    expect(FFDEC_XML.bitmap.idAttr).toBe('characterID');
    expect(FFDEC_XML.unsupportedIdAttr.DefineButton2Tag).toBe('buttonId');
    expect(FFDEC_XML.shape.idAttr).toBe('shapeId');
  });
});

describe('12.3 filter and blend-mode names observed on Ruffle 4a8d396 dumps (FFDec 26.4.0)', () => {
  // Excerpt: tests/tests/swfs/visual/blend_modes/add/test.swf, -swf2xml line 1046 (attributes trimmed to the ones used).
  const blendPlacement =
    '<item type="PlaceObject3Tag" blendMode="8" characterId="19" depth="3" placeFlagHasBlendMode="true" placeFlagHasFilterList="false" placeFlagHasMatrix="true" placeFlagMove="false">';
  // Excerpt: tests/tests/swfs/visual/cache_as_bitmap/contains_grown_filter/test.swf, sprite 3, line 56 and following.
  const filterPlacement =
    '<item type="PlaceObject3Tag" characterId="2" depth="1" placeFlagHasBlendMode="false" placeFlagHasFilterList="true" placeFlagHasMatrix="true" placeFlagMove="false">';
  const filterChild = '<surfaceFilterList><item type="GLOWFILTER" blurX="50.0" blurY="50.0"/></surfaceFilterList>';
  it('PlaceObject3Tag class name and the blend-mode flag and value', () => {
    const p = FFDEC_XML.place;
    expect(blendPlacement.includes(`type="${p.placeObject3}"`)).toBe(true);
    expect(blendPlacement.includes(`${p.flagHasBlendMode}="true"`)).toBe(true);
    expect(blendPlacement.includes(`${p.blendMode}="8"`)).toBe(true);
  });
  it('filter flag is true on a filtered placement, with surfaceFilterList child', () => {
    const p = FFDEC_XML.place;
    expect(filterPlacement.includes(`${p.flagHasFilterList}="true"`)).toBe(true);
    expect(filterPlacement.includes(`${p.flagHasBlendMode}="false"`)).toBe(true);
    expect(filterChild.includes(`<${p.surfaceFilterList}>`)).toBe(true);
  });
});
describe('12.7 clip depth value attribute observed on Ruffle 4a8d396 dumps (FFDec 26.4.0)', () => {
  // Excerpt: tests/tests/swfs/visual/simple_shapes/masks/test.swf, -swf2xml line 45 (attributes trimmed to the ones used).
  const maskPlacement =
    '<item type="PlaceObject2Tag" characterId="1" clipDepth="11" depth="1" placeFlagHasCharacter="true" placeFlagHasClipDepth="true" placeFlagHasMatrix="true" placeFlagMove="false">';
  // Excerpt: tests/tests/swfs/from_shumway/3_joystick/test.swf, line 931.
  const joystickMask =
    '<item type="PlaceObject2Tag" characterId="11" clipDepth="33" depth="16" placeFlagHasClipDepth="true" placeFlagHasMatrix="true" placeFlagMove="false">';
  it('the value attribute sits next to the flag set to true', () => {
    const p = FFDEC_XML.place;
    expect(maskPlacement.includes(`${p.flagHasClipDepth}="true"`)).toBe(true);
    expect(maskPlacement.includes(`${p.clipDepth}="11"`)).toBe(true);
    expect(joystickMask.includes(`${p.clipDepth}="33"`)).toBe(true);
  });
});