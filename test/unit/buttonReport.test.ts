import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import type { ButtonModel, ButtonRecordModel, TagsModel } from '../../src/convert/model';
import { knownVisualLimits } from '../../src/verify/core/limits';

const rec = (over: Partial<ButtonRecordModel> = {}): ButtonRecordModel => ({
  up: true,
  over: false,
  down: false,
  hit: true,
  characterId: 1,
  depth: 1,
  hasBlendMode: false,
  hasFilterList: false,
  ...over,
});
const svg = '<svg width="10px" height="10px"><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
const model = (buttons: ButtonModel[], placeButton: boolean): TagsModel => ({
  xmlVersion: { major: 4, minor: 2 },
  header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
  background: null,
  root: {
    declaredFrameCount: 1,
    ops: [...(placeButton ? [{ kind: 'place' as const, depth: 1, characterId: 5, move: false }] : []), { kind: 'showFrame' as const }],
  },
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
  buttons,
});
const button = (extra: Partial<ButtonModel> = {}, records: ButtonRecordModel[] = [rec()]): ButtonModel => ({
  id: 5,
  trackAsMenu: false,
  hasActions: false,
  records,
  ...extra,
});

describe('button entries in the Unsupported_Feature_List (Requirements 20.2, 20.13)', () => {
  it('delivered states leave no `button` entry', () => {
    const r = convertModel(model([button()], true));
    expect(r.unsupported.some((u) => u.kind === 'button')).toBe(false);
    expect(r.stats.placementsDropped).toBe(0);
  });

  it('an undelivered feature leaves its Named_Limit', () => {
    const r = convertModel(model([button({ hasActions: true }, [rec({ hasBlendMode: true })])], true));
    const kinds = r.unsupported.map((u) => u.kind);
    expect(kinds).toContain('button-avm1-actions');
    expect(kinds).toContain('button-record-effects');
    expect(kinds).toContain('button-sound');
    expect(kinds).not.toContain('button');
  });

  it('the Fidelity_Report limits list them when a button is placed, and not when it is not', () => {
    const opts = { allComparedFramesExact: true };
    const placed = convertModel(model([button({ hasActions: true })], true));
    const listed = knownVisualLimits(placed.scene, placed.unsupported, opts).map((l) => l.message);
    expect(listed.some((m) => m.includes('AVM1 button actions'))).toBe(true);
    expect(listed.some((m) => m.includes('DefineButtonSound'))).toBe(true);
    const unplaced = convertModel(model([button({ hasActions: true })], false));
    expect(knownVisualLimits(unplaced.scene, unplaced.unsupported, opts)).toEqual([]);
  });
});
