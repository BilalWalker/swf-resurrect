import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { UnknownSymbolError } from '../../src/convert/errors';
import type { TagsModel, TimelineOp } from '../../src/convert/model';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { serialiseUnsupported } from '../../src/pipeline/unsupported';
import type { SpriteSymbol } from '../../template/runtime/scene';

describe('convertModel', () => {
  it('converts the Click_Sample model to symbols 0..6 with the expected placements', async () => {
    const dir = resolve(__dirname, '../fixtures/clickgoto');
    const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
    const model = await readUnpacked({
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      textsDir: resolve(dir, 'texts'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: resolve(dir, 'symbols.csv'),
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    });
    const result = convertModel(model);

    expect(Object.keys(result.scene.symbols).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(result.shapeFiles.map((f) => f.fileName)).toEqual(['1.shape.json', '2.shape.json', '4.shape.json', '5.shape.json']);
    expect(result.shapeFiles.every((f) => !f.content.includes('\r'))).toBe(true);

    const root = result.scene.symbols['0'] as SpriteSymbol;
    expect(root.className).toBe('MainTimeline');
    expect(root.frameCount).toBe(3);
    const entries = root.frames[0];
    const left = entries.find((e) => e.name === 'l_button');
    const right = entries.find((e) => e.name === 'r_button');
    expect([left?.symbolId, left?.matrix[4], left?.matrix[5]]).toEqual([6, 143.5, 270]);
    expect([right?.symbolId, right?.matrix[4], right?.matrix[5]]).toEqual([3, 415, 272.5]);

    expect(result.unsupported.filter((u) => u.kind === 'unbound-instance')).toEqual([]);
    expect(JSON.parse(serialiseUnsupported(result.unsupported)).formatVersion).toBe(1);
  });

  const svg = '<svg><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
  const place = (depth: number, characterId: number): TimelineOp => ({ kind: 'place', depth, characterId, move: false });
  const modelWith = (ops: TimelineOp[], extra: Partial<TagsModel>): TagsModel => ({
    xmlVersion: { major: 4, minor: 2 },
    header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
    background: null,
    root: { declaredFrameCount: 1, ops: [...ops, { kind: 'showFrame' }] },
    sprites: [],
    declaredShapeIds: [1],
    morphShapeIds: [],
    staticTextIds: [],
    bitmapIds: [],
    shapeAssets: [{ id: 1, svg, origin: { x: 0, y: 0 } }],
    textAssets: [],
    symbolClasses: [],
    classSources: [],
    unsupported: [],
    ...extra,
  });

  it('drops placements of static text, DefineBits, button, sound and video characters', () => {
    const model = modelWith([place(1, 1), place(2, 2), place(3, 3), place(4, 4), place(5, 5), place(6, 6)], {
      staticTextIds: [2],
      bitmapIds: [3],
      unsupported: [
        { kind: 'button', tagName: 'DefineButton2Tag', characterId: 4 },
        { kind: 'sound', tagName: 'DefineSoundTag', characterId: 5 },
        { kind: 'video', tagName: 'DefineVideoStreamTag', characterId: 6 },
      ],
    });
    const r = convertModel(model);
    expect((r.scene.symbols['0'] as SpriteSymbol).frames[0].map((e) => e.symbolId)).toEqual([1]);
    const drops = r.unsupported.filter((u) => u.context !== undefined);
    expect(drops.map((d) => [d.kind, d.context])).toEqual([
      ['bitmap-fill', { spriteId: 0, frame: 1, depth: 3 }],
      ['button', { spriteId: 0, frame: 1, depth: 4 }],
      ['sound', { spriteId: 0, frame: 1, depth: 5 }],
      ['text', { spriteId: 0, frame: 1, depth: 2 }],
      ['video', { spriteId: 0, frame: 1, depth: 6 }],
    ].sort((a, b) => (a[0] as string).localeCompare(b[0] as string)) as never);
    expect(drops.find((d) => d.kind === 'bitmap-fill')?.message).toContain('DefineBits character placed directly');
  });

  it('still throws UnknownSymbolError for an id nobody defines', () => {
    expect(() => convertModel(modelWith([place(1, 77)], {}))).toThrow(UnknownSymbolError);
  });
});
