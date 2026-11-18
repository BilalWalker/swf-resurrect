// PURE: DefineButton / DefineButton2 records -> Scene_JSON 4 button symbol (robustness design, "Block C: buttons").
// No fs, child_process, clock, randomness or locale-dependent calls.
//
// A record joins every state whose flag is true. Each state is ordered by placeDepth; two records at one depth in one
// state keep the later one. Blend modes, filter lists, button actions (AVM1) and DefineButtonSound / DefineButtonCxform
// are not drawn or read; each is a Named_Limit.
import type { ButtonSymbol, ColorTransform8, DisplayListEntry, Matrix6 } from '../../template/runtime/scene';
import type { ButtonModel, ButtonRecordModel, ColorTransformModel, MatrixModel } from './model';

export type ButtonLimitKind = 'button-duplicate-depth' | 'button-record-effects' | 'button-avm1-actions';

export interface ButtonLimit {
  kind: ButtonLimitKind;
  message: string;
}

export interface BuiltButton {
  symbol: ButtonSymbol;
  limits: ButtonLimit[];
}

const STATE_NAMES = ['up', 'over', 'down', 'hit'] as const;
type StateName = (typeof STATE_NAMES)[number];

const IDENTITY_MATRIX: MatrixModel = { a: 1, b: 0, c: 0, d: 1, txTwips: 0, tyTwips: 0 };
const IDENTITY_CT: ColorTransformModel = { mul: [1, 1, 1, 1], add: [0, 0, 0, 0] };

/** Normalises -0 to 0 (Scene_JSON never holds -0). */
function norm(n: number): number {
  return n === 0 ? 0 : n;
}

function toEntry(r: ButtonRecordModel): DisplayListEntry {
  const m = r.matrix ?? IDENTITY_MATRIX;
  const ct = r.colorTransform ?? IDENTITY_CT;
  const matrix: Matrix6 = [norm(m.a), norm(m.b), norm(m.c), norm(m.d), norm(m.txTwips / 20), norm(m.tyTwips / 20)];
  const colorTransform: ColorTransform8 = [
    norm(ct.mul[0]),
    norm(ct.mul[1]),
    norm(ct.mul[2]),
    norm(ct.mul[3]),
    norm(ct.add[0]),
    norm(ct.add[1]),
    norm(ct.add[2]),
    norm(ct.add[3]),
  ];
  return { depth: r.depth, symbolId: r.characterId, matrix, colorTransform, name: '' };
}

/**
 * Builds the button symbol. Records are taken in tag order; `className` is the SymbolClass link, when there is one.
 * Every record's character must exist in the scene (the caller drops the others first).
 */
export function buildButton(button: ButtonModel, className?: string): BuiltButton {
  const limits: ButtonLimit[] = [];
  const who = `button ${button.id}`;

  const byState: Record<StateName, Map<number, DisplayListEntry>> = {
    up: new Map(),
    over: new Map(),
    down: new Map(),
    hit: new Map(),
  };
  const flagOf = (r: ButtonRecordModel, s: StateName): boolean => (s === 'hit' ? r.hit : r[s]);

  button.records.forEach((r, index) => {
    if (r.hasBlendMode || r.hasFilterList) {
      const what = [r.hasBlendMode ? 'blend mode' : '', r.hasFilterList ? 'filter list' : ''].filter((s) => s !== '').join(' and ');
      limits.push({
        kind: 'button-record-effects',
        message: `${what} is not drawn; record ${index} of ${who} (character ${r.characterId}) is drawn without it`,
      });
    }
    const entry = toEntry(r);
    for (const s of STATE_NAMES) {
      if (!flagOf(r, s)) continue;
      if (byState[s].has(r.depth)) {
        limits.push({
          kind: 'button-duplicate-depth',
          message: `two records at depth ${r.depth} in the ${s} state of ${who}; the later one (record ${index}, character ${r.characterId}) is kept`,
        });
      }
      byState[s].set(r.depth, entry);
    }
  });

  if (button.hasActions) {
    limits.push({
      kind: 'button-avm1-actions',
      message: `${who} has AVM1 button actions; they are ignored`,
    });
  }

  const list = (s: StateName): DisplayListEntry[] => [...byState[s].values()].sort((x, y) => x.depth - y.depth);
  const symbol: ButtonSymbol = {
    type: 'button',
    trackAsMenu: button.trackAsMenu,
    states: { up: list('up'), over: list('over'), down: list('down'), hit: list('hit') },
  };
  if (className !== undefined) symbol.className = className;
  return { symbol, limits };
}
