import { describe, expect, it } from 'vitest';
import { buildClassLinks, symbolClassPairs } from '../../src/convert/classLinks';
import { convertModel } from '../../src/convert/convertModel';
import { parseStructure } from '../../src/convert/ffdecXml';
import type { SymbolClassEntry, TagsModel, TimelineOp } from '../../src/convert/model';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';
import { parseSymbolsCsv } from '../../src/convert/symbolsCsv';
import { buildClassesTs } from '../../src/emit/planEmit';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { SceneParseError, validateScene } from '../../template/runtime/scene';
import { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';
import { measureSymbolClassSwf, symbolClassSwfSkipReason } from '../support/symbolClassSwf';

// Robustness task 25.2, Requirement 26.1 to 26.3, design D-D1. The lists are the ones of test/support/symbolClassSwf.ts.

const pair = (id: number, className: string): SymbolClassEntry => ({ id, className });
/** The SymbolClassTag pairs of the fixture, in tag order: id 2 has A, B, A; id 3 has C then D; id 0 has Doc and Extra. */
const CLASS_PAIRS: SymbolClassEntry[] = [pair(2, 'A'), pair(2, 'B'), pair(2, 'A'), pair(3, 'C'), pair(0, 'Doc'), pair(0, 'Extra'), pair(3, 'D')];
/** The ExportAssetsTag pairs FFDec appends to symbols.csv. */
const EXPORT_PAIRS: SymbolClassEntry[] = [pair(2, 'ExportName'), pair(3, 'C')];

const svg = '<svg width="10px" height="10px"><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
const place = (depth: number, characterId: number, name?: string): TimelineOp => ({
  kind: 'place',
  depth,
  characterId,
  move: false,
  ...(name === undefined ? {} : { name }),
});
const model = (symbolClasses: SymbolClassEntry[], classSources: TagsModel['classSources'] = []): TagsModel => ({
  xmlVersion: { major: 4, minor: 2 },
  header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
  background: null,
  root: { declaredFrameCount: 1, ops: [place(1, 2, 'one'), place(2, 3, 'two'), { kind: 'showFrame' }] },
  sprites: [2, 3].map((id) => ({ id, declaredFrameCount: 1, ops: [place(1, 1, 'part'), { kind: 'showFrame' }] as TimelineOp[] })),
  declaredShapeIds: [1],
  morphShapeIds: [],
  staticTextIds: [],
  bitmapIds: [],
  shapeAssets: [{ id: 1, svg, origin: { x: 0, y: 0 } }],
  textAssets: [],
  symbolClasses,
  classSources,
  unsupported: [],
});
const sprite = (scene: SceneJson, id: number): SpriteSymbol => scene.symbols[String(id)] as SpriteSymbol;

describe('buildClassLinks', () => {
  it('uses the last pair as the primary name, the first for id 0, and keeps every other name once', () => {
    const links = buildClassLinks(CLASS_PAIRS);
    expect(links.get(2)).toEqual({ primary: 'A', aliases: ['B'] });
    expect(links.get(3)).toEqual({ primary: 'D', aliases: ['C'] });
    expect(links.get(0)).toEqual({ primary: 'Doc', aliases: ['Extra'] });
  });

  it('counts identical repeats once and gives no alias', () => {
    expect(buildClassLinks([pair(5, 'X'), pair(5, 'X'), pair(5, 'X')]).get(5)).toEqual({ primary: 'X', aliases: [] });
  });

  it('drops the export pairs that follow the SymbolClassTag pairs, and keeps all entries without a count', () => {
    const csv = [...CLASS_PAIRS, ...EXPORT_PAIRS];
    expect(symbolClassPairs(csv, CLASS_PAIRS.length)).toEqual(CLASS_PAIRS);
    expect(symbolClassPairs(csv, undefined)).toEqual(csv);
    expect(symbolClassPairs(csv, 0)).toEqual([]);
  });
});

describe('parseStructure counts the SymbolClassTag pairs', () => {
  const item = (tag: string, pairs: Array<[number, string]>): string =>
    `<item type="${tag}"><tags>${pairs.map(([i]) => `<item>${i}</item>`).join('')}</tags><names>${pairs.map(([, n]) => `<item>${n}</item>`).join('')}</names></item>`;
  const dump = (items: string): string => `<swf _xmlExportMajor="4" _xmlExportMinor="2" frameRate="12" frameCount="1"><tags>${items}</tags></swf>`;

  it('adds the items of every SymbolClassTag and ignores ExportAssetsTag', () => {
    const s = parseStructure(
      dump(item('SymbolClassTag', [[2, 'A'], [2, 'B'], [0, 'Doc']]) + item('ExportAssetsTag', [[2, 'E']]) + item('SymbolClassTag', [[3, 'D']])),
    );
    expect(s.symbolClassPairs).toBe(4);
  });

  it('is 0 without the tag', () => {
    expect(parseStructure(dump('')).symbolClassPairs).toBe(0);
  });
});

describe('convertModel with several names for one id', () => {
  const converted = (): ReturnType<typeof convertModel> => convertModel(model(CLASS_PAIRS));

  it('does not throw, links the last name and keeps the others as aliases', () => {
    const { scene } = converted();
    expect(sprite(scene, 2)).toMatchObject({ className: 'A', classAliases: ['B'] });
    expect(sprite(scene, 3)).toMatchObject({ className: 'D', classAliases: ['C'] });
  });

  it('id 0 keeps the document class first and the other name as an alias', () => {
    expect(sprite(converted().scene, 0)).toMatchObject({ className: 'Doc', classAliases: ['Extra'] });
  });

  it('an identical repeat gives no alias and the field is absent', () => {
    const { scene } = convertModel(model([pair(2, 'A'), pair(2, 'A'), pair(2, 'A')]));
    expect(sprite(scene, 2).className).toBe('A');
    expect('classAliases' in sprite(scene, 2)).toBe(false);
  });

  it('the unbound-instance check accepts an instance declared by any name of the symbol', () => {
    const sources = [
      { className: 'A', properties: [] },
      { className: 'B', properties: ['part'] },
    ];
    const r = convertModel(model([pair(2, 'A'), pair(2, 'B')], sources));
    expect(r.unsupported.filter((u) => u.kind === 'unbound-instance' && u.id === 2)).toEqual([]);
    const r2 = convertModel(model([pair(2, 'A')], [{ className: 'A', properties: [] }]));
    expect(r2.unsupported.filter((u) => u.kind === 'unbound-instance' && u.id === 2)).toHaveLength(1);
  });

  it('writes the scene with aliases, reads it back, and writes no field for a symbol without aliases', () => {
    const text = serialiseScene(converted().scene);
    expect(parseScene(text).symbols['2']).toMatchObject({ className: 'A', classAliases: ['B'] });
    const plain = serialiseScene(convertModel(model([pair(2, 'A'), pair(3, 'C')])).scene);
    expect(plain).not.toContain('classAliases');
    expect(JSON.parse(plain).formatVersion).toBe(3);
  });
});

describe('reader', () => {
  const scene = (formatVersion: number, classAliases: unknown): unknown => {
    const s = JSON.parse(serialiseScene(convertModel(model([pair(2, 'A')])).scene)) as SceneJson & { symbols: Record<string, Record<string, unknown>> };
    s.formatVersion = formatVersion as 3;
    s.symbols['2'].classAliases = classAliases;
    return s;
  };

  it('accepts classAliases in formatVersion 3 and rejects a value that is not an array of strings', () => {
    expect(() => validateScene(scene(3, ['B']))).not.toThrow();
    expect(() => validateScene(scene(3, [1]))).toThrow(SceneParseError);
    expect(() => validateScene(scene(3, 'B'))).toThrow(SceneParseError);
  });

  it('accepts classAliases on a button symbol in formatVersion 4', () => {
    const s = {
      formatVersion: 4,
      stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 12 },
      rootSymbolId: 0,
      symbols: {
        '0': { type: 'sprite', frameCount: 1, frames: [[{ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name: '' }]], labels: [], scenes: [{ name: 'Scene 1', firstFrame: 1 }] },
        '1': { type: 'button', className: 'Btn', classAliases: ['Btn2'], trackAsMenu: false, states: { up: [], over: [], down: [], hit: [] } },
      },
    };
    expect(() => validateScene(s)).not.toThrow();
  });
});

describe('Emit registry', () => {
  it('holds every name of a linked symbol', () => {
    const { scene } = convertModel(model(CLASS_PAIRS));
    const ts = buildClassesTs(scene, ['A', 'B', 'C', 'D', 'Doc', 'Extra', 'Other']);
    for (const n of ['A', 'B', 'C', 'D', 'Doc', 'Extra']) expect(ts).toContain(`${n}`);
    expect(ts).not.toContain('Other');
    expect(ts).toMatch(/\bB\b/);
    expect(ts).toMatch(/\bC\b/);
  });
});

describe('Player', () => {
  const CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
  const entry = (depth: number, symbolId: number, name: string): DisplayListEntry => ({ depth, symbolId, matrix: [1, 0, 0, 1, 0, 0], colorTransform: CT, name });
  const clip = (frames: DisplayListEntry[][], extra: Partial<SpriteSymbol> = {}): SpriteSymbol => ({
    type: 'sprite',
    frameCount: frames.length,
    frames,
    labels: [],
    ...extra,
  });
  const start = (symbols: SceneJson['symbols'], registry: Record<string, new () => MovieClip>): Player =>
    new Player({
      scene: { formatVersion: 3, stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 }, rootSymbolId: 0, symbols },
      backend: new FakeBackend(),
      clock: new ManualClock(),
      classRegistry: registry,
      shapeBounds: new Map(),
    });

  it('new Alias() from script builds the same children as the primary, for a separate class and a subclass', () => {
    class Primary extends MovieClip {}
    class Alias extends MovieClip {}
    class SubAlias extends Primary {}
    start(
      { '0': clip([[]]), '1': clip([[entry(1, 2, 'inner')]], { className: 'Primary', classAliases: ['Alias', 'SubAlias'] }), '2': clip([[]]) },
      { Primary, Alias, SubAlias },
    );
    for (const make of [() => new Primary(), () => new Alias(), () => new SubAlias()]) {
      const made = make() as unknown as { inner: unknown };
      expect(made.inner).toBeInstanceOf(MovieClip);
    }
  });

  it('without an alias an unrelated registered class still builds no children', () => {
    class Primary extends MovieClip {}
    class Other extends MovieClip {}
    start({ '0': clip([[]]), '1': clip([[entry(1, 2, 'inner')]], { className: 'Primary' }), '2': clip([[]]) }, { Primary, Other });
    expect(new Other().numChildren).toBe(0);
  });

  it('a placement is still built with the primary class', () => {
    class Primary extends MovieClip {}
    class Alias extends MovieClip {}
    const p = start(
      { '0': clip([[entry(1, 1, 'one')]]), '1': clip([[]], { className: 'Primary', classAliases: ['Alias'] }) },
      { Primary, Alias },
    );
    expect((p.root as unknown as { one: unknown }).one).toBeInstanceOf(Primary);
  });
});

const skip = symbolClassSwfSkipReason();
describe.skipIf(skip !== null)('the generated fixture, through the real csv', () => {
  it('drops the export pairs by position and converts without throwing', () => {
    const { csvLines, dump } = measureSymbolClassSwf();
    const entries = parseSymbolsCsv(csvLines.join('\n'));
    const n = parseStructure(dump).symbolClassPairs;
    expect(n).toBe(CLASS_PAIRS.length);
    expect(entries.length).toBe(CLASS_PAIRS.length + EXPORT_PAIRS.length);
    const kept = symbolClassPairs(entries, n);
    expect(kept).toEqual(CLASS_PAIRS);
    const links = buildClassLinks(kept);
    expect(links.get(2)).toEqual({ primary: 'A', aliases: ['B'] });
    expect(() => convertModel(model(kept))).not.toThrow();
  }, 120_000);
});
