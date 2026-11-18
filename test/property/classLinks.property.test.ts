import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildClassLinks, symbolClassPairs } from '../../src/convert/classLinks';
import { convertModel } from '../../src/convert/convertModel';
import type { SymbolClassEntry, TagsModel, TimelineOp } from '../../src/convert/model';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';
import { symbolClassNames } from '../../template/runtime/scene';
import type { SpriteSymbol } from '../../template/runtime/scene';
import { fcConfig } from './config';
import { genSingleNameList, genSymbolClassList, KNOWN_SPRITE_IDS } from './gen/genSymbolClassPairs';

// Feature: robustness, Property 26: every SymbolClass pair stays linked, className follows Ruffle's last-pair rule, no list throws.
// Validates: Requirements 26.1, 26.2, 26.3 (design D-D1).

const svg = '<svg width="10px" height="10px"><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
const place = (depth: number, characterId: number, name?: string): TimelineOp => ({
  kind: 'place',
  depth,
  characterId,
  move: false,
  ...(name === undefined ? {} : { name }),
});
const model = (symbolClasses: SymbolClassEntry[]): TagsModel => ({
  xmlVersion: { major: 4, minor: 2 },
  header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
  background: null,
  root: { declaredFrameCount: 1, ops: [place(1, 2, 'one'), place(2, 3, 'two'), place(3, 4, 'three'), { kind: 'showFrame' }] },
  sprites: KNOWN_SPRITE_IDS.map((id) => ({ id, declaredFrameCount: 1, ops: [place(1, 1, 'part'), { kind: 'showFrame' }] as TimelineOp[] })),
  declaredShapeIds: [1],
  morphShapeIds: [],
  staticTextIds: [],
  bitmapIds: [],
  shapeAssets: [{ id: 1, svg, origin: { x: 0, y: 0 } }],
  textAssets: [],
  symbolClasses,
  classSources: [],
  unsupported: [],
});

/** Ruffle's rule: the last pair of an id is the class, the first pair for id 0. */
const expectedPrimary = (list: SymbolClassEntry[], id: number): string | undefined => {
  const names = list.filter((p) => p.id === id).map((p) => p.className);
  return names.length === 0 ? undefined : id === 0 ? names[0] : names[names.length - 1];
};

describe('Property 26: SymbolClass links', () => {
  it('never throws, and every distinct (id, name) pair resolves to its symbol with the Ruffle primary', () => {
    fc.assert(
      fc.property(genSymbolClassList, (list) => {
        const links = buildClassLinks(list);
        const { scene } = convertModel(model(list));
        for (const [id, link] of links) {
          expect(link.primary).toBe(expectedPrimary(list, id));
          expect(link.aliases).not.toContain(link.primary);
          expect(new Set(link.aliases).size).toBe(link.aliases.length);
        }
        for (const p of list) {
          const sym = scene.symbols[String(p.id)] as SpriteSymbol | undefined;
          if (sym === undefined || (p.id !== 0 && !KNOWN_SPRITE_IDS.includes(p.id as 2))) continue;
          expect(symbolClassNames(sym)).toContain(p.className);
          expect(sym.className).toBe(expectedPrimary(list, p.id));
        }
        // Names of a symbol are exactly the distinct names of its pairs.
        for (const id of [0, ...KNOWN_SPRITE_IDS]) {
          const sym = scene.symbols[String(id)] as SpriteSymbol | undefined;
          const distinct = [...new Set(list.filter((p) => p.id === id).map((p) => p.className))];
          expect([...symbolClassNames(sym ?? {})].sort()).toEqual(distinct.sort());
        }
      }),
      fcConfig,
    );
  });

  it('collapses identical repeats: the scene bytes equal those of the list without repeats, and carry no aliases', () => {
    fc.assert(
      fc.property(genSingleNameList, ({ plain, repeated }) => {
        const a = serialiseScene(convertModel(model(plain)).scene);
        const b = serialiseScene(convertModel(model(repeated)).scene);
        expect(b).toBe(a);
        expect(a).not.toContain('classAliases');
      }),
      fcConfig,
    );
  });

  it('writing then parsing the scene round-trips, aliases included', () => {
    fc.assert(
      fc.property(genSymbolClassList, (list) => {
        const text = serialiseScene(convertModel(model(list)).scene);
        expect(parseScene(text)).toEqual(JSON.parse(text));
        expect(serialiseScene(parseScene(text))).toBe(text);
      }),
      fcConfig,
    );
  });

  it('keeps only the SymbolClassTag prefix of the csv entries', () => {
    fc.assert(
      fc.property(genSymbolClassList, genSymbolClassList, (classPairs, exportPairs) => {
        const csv = [...classPairs, ...exportPairs];
        expect(symbolClassPairs(csv, classPairs.length)).toEqual(classPairs);
        expect(symbolClassPairs(csv, undefined)).toEqual(csv);
      }),
      fcConfig,
    );
  });
});
