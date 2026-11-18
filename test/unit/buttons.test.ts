import { describe, expect, it } from 'vitest';
import { buildButton } from '../../src/convert/buttons';
import { convertModel } from '../../src/convert/convertModel';
import { parseStructure } from '../../src/convert/ffdecXml';
import type { ButtonModel, ButtonRecordModel, TagsModel, TimelineOp } from '../../src/convert/model';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';
import { SceneParseError, validateScene } from '../../template/runtime/scene';
import type { SceneJson } from '../../template/runtime/scene';

const rec = (over: Partial<ButtonRecordModel> = {}): ButtonRecordModel => ({
  up: false,
  over: false,
  down: false,
  hit: false,
  characterId: 1,
  depth: 1,
  hasBlendMode: false,
  hasFilterList: false,
  ...over,
});
const btn = (records: ButtonRecordModel[], extra: Partial<ButtonModel> = {}): ButtonModel => ({
  id: 5,
  trackAsMenu: false,
  hasActions: false,
  records,
  ...extra,
});

describe('buildButton', () => {
  it('puts a record into exactly the states whose flag is true', () => {
    const { symbol } = buildButton(
      btn([rec({ up: true, hit: true, characterId: 1, depth: 1 }), rec({ over: true, down: true, characterId: 2, depth: 2 })]),
    );
    const ids = (s: keyof typeof symbol.states): number[] => symbol.states[s].map((e) => e.symbolId);
    expect([ids('up'), ids('over'), ids('down'), ids('hit')]).toEqual([[1], [2], [2], [1]]);
  });

  it('orders each state by placeDepth, whatever the record order', () => {
    const { symbol } = buildButton(
      btn([
        rec({ up: true, characterId: 3, depth: 9 }),
        rec({ up: true, characterId: 1, depth: 2 }),
        rec({ up: true, characterId: 2, depth: 5 }),
      ]),
    );
    expect(symbol.states.up.map((e) => [e.depth, e.symbolId])).toEqual([[2, 1], [5, 2], [9, 3]]);
    expect(symbol.states.up.every((e) => e.name === '')).toBe(true);
  });

  it('keeps the later of two records at one depth in one state and records button-duplicate-depth', () => {
    const { symbol, limits } = buildButton(
      btn([
        rec({ up: true, over: true, characterId: 1, depth: 3 }),
        rec({ up: true, characterId: 2, depth: 3 }),
      ]),
    );
    expect(symbol.states.up.map((e) => e.symbolId)).toEqual([2]);
    expect(symbol.states.over.map((e) => e.symbolId)).toEqual([1]);
    expect(limits.map((l) => l.kind)).toEqual(['button-duplicate-depth']);
  });

  it('draws a record with a blend mode or filter list without it and records button-record-effects', () => {
    const { symbol, limits } = buildButton(btn([rec({ up: true, hasBlendMode: true }), rec({ up: true, depth: 2, hasFilterList: true })]));
    expect(symbol.states.up).toHaveLength(2);
    expect(limits.map((l) => l.kind)).toEqual(['button-record-effects', 'button-record-effects']);
  });

  it('ignores button actions with button-avm1-actions, and carries trackAsMenu and className', () => {
    const built = buildButton(btn([rec({ up: true })], { hasActions: true, trackAsMenu: true }), 'MenuButton');
    expect(built.limits.map((l) => l.kind)).toEqual(['button-avm1-actions']);
    expect(built.symbol).toMatchObject({ type: 'button', className: 'MenuButton', trackAsMenu: true });
    expect(buildButton(btn([])).symbol.className).toBeUndefined();
  });

  it('converts the matrix from twips and a colour transform, and normalises -0', () => {
    const { symbol } = buildButton(
      btn([
        rec({
          up: true,
          matrix: { a: 2, b: 0, c: -0, d: 2, txTwips: 40, tyTwips: -0 },
          colorTransform: { mul: [1, 1, 1, 0.5], add: [0, 0, 0, 0] },
        }),
      ]),
    );
    const e = symbol.states.up[0];
    expect(e.matrix).toEqual([2, 0, 0, 2, 2, 0]);
    expect(e.matrix.some((n) => Object.is(n, -0))).toBe(false);
    expect(e.colorTransform).toEqual([1, 1, 1, 0.5, 0, 0, 0, 0]);
  });
});

describe('parseStructure buttons', () => {
  const dump = (items: string): string =>
    `<swf _xmlExportMajor="4" _xmlExportMinor="2" frameRate="12" frameCount="1"><tags>${items}</tags></swf>`;
  const rect = '<item type="BUTTONRECORD" buttonStateUp="true" buttonStateOver="false" buttonStateDown="false" buttonStateHitTest="true" characterId="1" placeDepth="1" buttonHasBlendMode="false" buttonHasFilterList="false"><placeMatrix type="MATRIX" hasRotate="false" hasScale="false" translateX="40" translateY="60"/></item>';

  it('reads a DefineButton2Tag into a ButtonModel and leaves it out of the unsupported list', () => {
    const s = parseStructure(dump(`<item type="DefineButton2Tag" buttonId="7" trackAsMenu="true"><characters>${rect}</characters><actions/></item>`));
    expect(s.unsupported).toEqual([]);
    expect(s.buttons).toHaveLength(1);
    expect(s.buttons[0]).toMatchObject({ id: 7, trackAsMenu: true, hasActions: false });
    expect(s.buttons[0].records[0]).toMatchObject({ up: true, over: false, hit: true, characterId: 1, depth: 1 });
    expect(s.buttons[0].records[0].matrix).toMatchObject({ txTwips: 40, tyTwips: 60 });
  });

  it('reads a DefineButtonTag, and its non-empty actionBytes as AVM1 actions', () => {
    const s = parseStructure(dump(`<item type="DefineButtonTag" buttonId="8" actionBytes="0A0B"><characters>${rect}</characters></item>`));
    expect(s.buttons[0]).toMatchObject({ id: 8, trackAsMenu: false, hasActions: true });
  });
});

describe('Scene_JSON version with buttons', () => {
  const place = (depth: number, characterId: number): TimelineOp => ({ kind: 'place', depth, characterId, move: false });
  const svg = '<svg width="10px" height="10px"><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
  const model = (buttons: ButtonModel[] | undefined, ops: TimelineOp[]): TagsModel => ({
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
    ...(buttons === undefined ? {} : { buttons }),
  });

  it('is 3 without a button symbol and the file round trips', () => {
    const r = convertModel(model(undefined, [place(1, 1)]));
    expect(r.scene.formatVersion).toBe(3);
    expect(parseScene(serialiseScene(r.scene)).formatVersion).toBe(3);
  });

  it('is 4 with a button symbol, the button placement is kept and not counted as dropped', () => {
    const r = convertModel(model([btn([rec({ up: true, hit: true })])], [place(1, 5)]));
    expect(r.scene.formatVersion).toBe(4);
    expect(r.stats.placementsDropped).toBe(0);
    expect(r.unsupported.some((u) => u.kind === 'button')).toBe(false);
    expect(r.unsupported.map((u) => u.kind)).toContain('button-sound');
    const text = serialiseScene(r.scene);
    expect(JSON.parse(text).formatVersion).toBe(4);
    expect(parseScene(text)).toEqual(r.scene);
    const root = r.scene.symbols['0'];
    expect(root.type === 'sprite' && root.frames[0].map((e) => e.symbolId)).toEqual([5]);
  });

  it('leaves out a record whose character is not drawn and says so', () => {
    const m = model([btn([rec({ up: true, characterId: 1 }), rec({ up: true, characterId: 9, depth: 2 })])], []);
    m.unsupported = [{ kind: 'text', tagName: 'DefineEditTextTag', characterId: 9 }];
    const r = convertModel(m);
    const b = r.scene.symbols['5'];
    expect(b.type === 'button' && b.states.up.map((e) => e.symbolId)).toEqual([1]);
    expect(r.unsupported.some((u) => u.kind === 'text' && u.message.includes('button 5'))).toBe(true);
  });

  it('the reader accepts versions 2, 3 and 4 and refuses a button below 4', () => {
    const base = {
      stage: { width: 1, height: 1, backgroundColor: '#ffffff', frameRate: 1 },
      rootSymbolId: 0,
      symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [] } },
    };
    for (const v of [2, 3, 4]) expect(() => validateScene({ formatVersion: v, ...base })).not.toThrow();
    expect(() => validateScene({ formatVersion: 5, ...base })).toThrow(SceneParseError);
    const withButton = (v: number): SceneJson =>
      ({
        formatVersion: v,
        ...base,
        symbols: {
          ...base.symbols,
          '1': { type: 'button', trackAsMenu: false, states: { up: [], over: [], down: [], hit: [] } },
        },
      }) as unknown as SceneJson;
    expect(() => validateScene(withButton(4))).not.toThrow();
    expect(() => validateScene(withButton(3))).toThrow(SceneParseError);
  });
});
