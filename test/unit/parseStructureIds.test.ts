import { describe, expect, it } from 'vitest';
import { parseStructure } from '../../src/convert/ffdecXml';

/** Smallest dump parseStructure accepts, holding the given root tag items. */
function dump(items: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="1" frameRate="24.0">',
    '<tags>',
    ...items,
    '<item type="ShowFrameTag"/>',
    '</tags>',
    '</swf>',
  ].join('\n');
}

describe('parseStructure character ids of non-shape definitions (task 3.3)', () => {
  it('reads static text ids from DefineTextTag characterID', () => {
    const s = parseStructure(dump(['<item type="DefineTextTag" characterID="3" forceWriteAsLong="false"/>']));
    expect(s.staticTextIds).toEqual([3]);
    expect(s.unsupported).toEqual([]);
  });

  it('records dynamic text with its id and the not-rendered message', () => {
    const s = parseStructure(dump(['<item type="DefineEditTextTag" characterID="10" fontId="2"/>']));
    expect(s.unsupported).toEqual([
      { kind: 'text', tagName: 'DefineEditTextTag', characterId: 10, message: 'dynamic text (DefineEditText) is not rendered' },
    ]);
    expect(s.staticTextIds).toEqual([]);
  });

  it('reads the button id from buttonId', () => {
    const s = parseStructure(dump(['<item type="DefineButton2Tag" buttonId="7"/>']));
    expect(s.unsupported).toEqual([{ kind: 'button', tagName: 'DefineButton2Tag', characterId: 7 }]);
  });

  it('collects DefineBits* ids as non-placed definitions without an observation', () => {
    const s = parseStructure(
      dump([
        '<item type="DefineBitsTag" characterID="4"/>',
        '<item type="DefineBitsJPEG3Tag" characterID="5"/>',
        '<item type="DefineBitsLosslessTag" characterID="6"/>',
        '<item type="DefineBitsLossless2Tag" characterID="8"/>',
      ]),
    );
    expect(s.bitmapIds).toEqual([4, 5, 6, 8]);
    expect(s.unsupported).toEqual([]);
  });

  it('ignores font definition tags', () => {
    const s = parseStructure(
      dump(['<item type="DefineFont3Tag" fontID="2"/>', '<item type="DefineFontAlignZonesTag" fontID="2"/>']),
    );
    expect(s.unsupported).toEqual([]);
  });
});
