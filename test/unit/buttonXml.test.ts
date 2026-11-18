import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { FFDEC_XML } from '../../src/convert/ffdecXml';
import { BUTTON_IDS, buttonSkeletonXml, buttonSwfSkipReason, generateButtonDump } from '../support/buttonSwf';

// Names measured on a file FFDec 26.4.0 wrote (generated round trip, robustness F3 / U5 / O11).
const skip = buttonSwfSkipReason();
if (skip) console.warn(`buttonXml: round trip skipped: ${skip}`);

interface Node { [k: string]: unknown }
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: (n) => n === 'item' });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function tags(dump: string): Node[] {
  const doc = parser.parse(dump) as { swf: { tags: { item: Node[] } } };
  return doc.swf.tags.item;
}

describe('button XML names', () => {
  const b = FFDEC_XML.button;

  it('the skeleton names the same tags the table lists', () => {
    const xml = buttonSkeletonXml();
    expect(xml).toContain(`type="${b.tagV1}"`);
    expect(xml).toContain(`type="${b.tagV2}"`);
    expect(FFDEC_XML.unsupportedKinds[b.tagV1]).toBe('button');
    expect(FFDEC_XML.unsupportedIdAttr[b.tagV1]).toBe(b.idAttr);
    expect(FFDEC_XML.unsupportedIdAttr[b.tagV2]).toBe(b.idAttr);
  });

  it.skipIf(skip !== null)('both tags, their attributes and the record flags parse from the generated dump', () => {
    const items = tags(generateButtonDump());
    const v1 = items.find((i) => i.type === b.tagV1) as Node;
    const v2 = items.find((i) => i.type === b.tagV2) as Node;
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();

    expect(v1[b.idAttr]).toBe(String(BUTTON_IDS.buttonV1));
    expect(v1[b.actionBytes]).toBe('');
    expect(v1.forceWriteAsLong).toBe('false');
    expect(v1.trackAsMenu).toBeUndefined();

    expect(v2[b.idAttr]).toBe(String(BUTTON_IDS.buttonV2));
    expect(v2[b.trackAsMenu]).toBe('true');
    expect(v2.reserved).toBe('0');
    expect(v2.actions).toBeDefined();

    const recs1 = asArray(((v1[b.characters] as Node)?.item as Node[]) ?? []);
    expect(recs1).toHaveLength(2);
    const [r0, r1] = recs1;
    expect(r0.type).toBe(b.record);
    expect([r0[b.stateUp], r0[b.stateOver], r0[b.stateDown], r0[b.stateHit]]).toEqual(['true', 'false', 'false', 'true']);
    expect([r1[b.stateUp], r1[b.stateOver], r1[b.stateDown], r1[b.stateHit]]).toEqual(['false', 'true', 'true', 'false']);
    expect(r0[b.characterId]).toBe(String(BUTTON_IDS.shapeA));
    expect(r0[b.placeDepth]).toBe('1');
    expect(r1[b.placeDepth]).toBe('2');
    expect(r0[b.hasBlendMode]).toBe('false');
    expect(r0[b.hasFilterList]).toBe('false');
    expect(r0[b.placeMatrix]).toBeDefined();
    expect(r0[b.colorTransform]).toBeUndefined(); // a v1 record has none

    const recs2 = asArray(((v2[b.characters] as Node)?.item as Node[]) ?? []);
    expect(recs2).toHaveLength(1);
    const q = recs2[0];
    expect([q[b.stateUp], q[b.stateOver], q[b.stateDown], q[b.stateHit]]).toEqual(['true', 'true', 'true', 'true']);
    expect(q[b.colorTransform]).toBeDefined(); // a v2 record has one
  }, 180_000);
});
