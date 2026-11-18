import fc from 'fast-check';
import type { SymbolClassEntry } from '../../../src/convert/model';

/** Ids the model of the property test knows: 0 root, 1 shape, 2 to 4 sprites. 9 and 10 have no character. */
export const KNOWN_SPRITE_IDS = [2, 3, 4] as const;
const IDS = [0, 1, 2, 3, 4, 9, 10] as const;
const NAMES = ['A', 'B', 'C', 'Main', 'a.b.Cls', 'a.b.Other', 'pkg.Cls', 'x_1'] as const;

export const genSymbolClassPair: fc.Arbitrary<SymbolClassEntry> = fc.record({
  id: fc.constantFrom(...IDS),
  className: fc.constantFrom(...NAMES),
});

/** Any list: repeats, several names per id, id 0, ids with and without a character. */
export const genSymbolClassList: fc.Arbitrary<SymbolClassEntry[]> = fc.array(genSymbolClassPair, { maxLength: 24 });

/** A list in which each id has one name, repeated any number of times (so no id has an alias). */
export const genSingleNameList: fc.Arbitrary<{ plain: SymbolClassEntry[]; repeated: SymbolClassEntry[] }> = fc
  .uniqueArray(fc.constantFrom(...IDS), { maxLength: IDS.length })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => fc.record({ id: fc.constant(id), className: fc.constantFrom(...NAMES), n: fc.integer({ min: 1, max: 3 }) }))).map((rows) => ({
      plain: rows.map((r) => ({ id: r.id, className: r.className })),
      repeated: rows.flatMap((r) => Array.from({ length: r.n }, () => ({ id: r.id, className: r.className }))),
    })),
  );
