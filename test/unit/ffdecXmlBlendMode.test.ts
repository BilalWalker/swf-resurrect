import { describe, expect, it } from 'vitest';
import { parseStructure } from '../../src/convert/ffdecXml';
/** One PlaceObject3Tag dump with the given blend attributes (flag and value as FFDec 26.4.0 writes them). */
function placeOf(blendAttrs: string): { hasBlendMode?: boolean } {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="1" frameRate="24.0">',
    '<tags>',
    `<item type="PlaceObject3Tag" ${blendAttrs} characterId="1" depth="3" placeFlagHasMatrix="false" placeFlagMove="false"/>`,
    '<item type="ShowFrameTag"/>',
    '</tags>',
    '</swf>',
  ].join('\n');
  const op = parseStructure(xml).root.ops.find((o) => o.kind === 'place');
  if (!op || op.kind !== 'place') throw new Error('no placement parsed');
  return op;
}
describe('parseStructure blend mode (sub-task 28.2)', () => {
  it.each([
    ['blendMode 0', 'blendMode="0" placeFlagHasBlendMode="true"'],
    ['blendMode 1', 'blendMode="1" placeFlagHasBlendMode="true"'],
    ['flag true, value absent', 'placeFlagHasBlendMode="true"'],
    ['flag false', 'placeFlagHasBlendMode="false"'],
  ])('%s records no blend mode', (_n, attrs) => {
    expect(placeOf(attrs).hasBlendMode).toBeUndefined();
  });
  it.each(['2', '8', '14'])('blendMode %s is kept as a blend mode', (v) => {
    expect(placeOf(`blendMode="${v}" placeFlagHasBlendMode="true"`).hasBlendMode).toBe(true);
  });
});