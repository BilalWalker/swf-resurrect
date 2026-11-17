import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { parseStructure } from '../../src/convert/ffdecXml';
import type { TagsModel } from '../../src/convert/model';
import { serialiseScene } from '../../src/convert/sceneJson';
import type { SpriteSymbol } from '../../template/runtime/scene';
// Excerpt in the shape FFDec 26.4.0 writes (offsets 0-based, names in the same order).
const dump = (sceneTag: string): string =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="3" frameRate="24.0">',
    '<tags>',
    sceneTag,
    '<item type="ShowFrameTag"/>',
    '<item type="ShowFrameTag"/>',
    '<item type="ShowFrameTag"/>',
    '</tags>',
    '</swf>',
  ].join('\n');
const twoScenes = [
  '<item type="DefineSceneAndFrameLabelDataTag" forceWriteAsLong="true">',
  '<sceneOffsets><item>0</item><item>2</item></sceneOffsets>',
  '<sceneNames><item>First</item><item>Second</item></sceneNames>',
  '<frameNums/><frameNames/>',
  '</item>',
].join('\n');
function model(scenes: TagsModel['scenes']): TagsModel {
  return {
    xmlVersion: { major: 4, minor: 2 },
    header: { widthPx: 10, heightPx: 10, frameRate: 12, frameCount: 3 },
    background: null,
    root: { declaredFrameCount: 3, ops: [{ kind: 'showFrame' }, { kind: 'showFrame' }, { kind: 'showFrame' }] },
    sprites: [],
    declaredShapeIds: [],
    morphShapeIds: [],
    staticTextIds: [],
    bitmapIds: [],
    shapeAssets: [],
    textAssets: [],
    symbolClasses: [],
    classSources: [],
    unsupported: [],
    ...(scenes === undefined ? {} : { scenes }),
  };
}
describe('Convert scenes (as3-coverage 24.1)', () => {
  it('reads offsets 0 and 2 as 1-based first frames with their names', () => {
    expect(parseStructure(dump(twoScenes)).scenes).toEqual([
      { name: 'First', firstFrame: 1 },
      { name: 'Second', firstFrame: 3 },
    ]);
  });
  it('gives no scenes without the tag, and one scene at frame 1 in the scene', () => {
    expect(parseStructure(dump('')).scenes).toEqual([]);
    const result = convertModel(model(undefined));
    expect((result.scene.symbols['0'] as SpriteSymbol).scenes).toEqual([{ name: 'Scene 1', firstFrame: 1 }]);
  });
  it('writes the scenes and formatVersion 3', () => {
    const result = convertModel(model(parseStructure(dump(twoScenes)).scenes));
    expect(result.scene.formatVersion).toBe(3);
    const text = serialiseScene(result.scene);
    expect(text).toContain('"formatVersion": 3');
    expect((JSON.parse(text).symbols['0'] as SpriteSymbol).scenes).toHaveLength(2);
  });
  it('ignores a scene beyond the frame count with a warning', () => {
    const r = convertModel(model([{ name: 'A', firstFrame: 1 }, { name: 'B', firstFrame: 9 }]));
    expect((r.scene.symbols['0'] as SpriteSymbol).scenes).toEqual([{ name: 'A', firstFrame: 1 }]);
    expect(r.warnings.some((w) => w.includes('"B"'))).toBe(true);
  });
});
