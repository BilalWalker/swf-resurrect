import fc from 'fast-check';
import type { ButtonRecordModel } from '../../../src/convert/model';

const num = fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true });
const four = fc.tuple(num, num, num, num);

/** One BUTTONRECORD: any subset of the four state flags (including none), small depths so repeats happen. */
export const genButtonRecord: fc.Arbitrary<ButtonRecordModel> = fc.record(
  {
    up: fc.boolean(),
    over: fc.boolean(),
    down: fc.boolean(),
    hit: fc.boolean(),
    characterId: fc.integer({ min: 1, max: 20 }),
    depth: fc.integer({ min: 1, max: 6 }),
    hasBlendMode: fc.boolean(),
    hasFilterList: fc.boolean(),
    matrix: fc.record({
      a: num,
      b: num,
      c: num,
      d: num,
      txTwips: fc.integer({ min: -20000, max: 20000 }),
      tyTwips: fc.integer({ min: -20000, max: 20000 }),
    }),
    colorTransform: fc.record({ mul: four, add: four }),
  },
  { requiredKeys: ['up', 'over', 'down', 'hit', 'characterId', 'depth', 'hasBlendMode', 'hasFilterList'] },
) as fc.Arbitrary<ButtonRecordModel>;

export const genButtonRecords: fc.Arbitrary<ButtonRecordModel[]> = fc.array(genButtonRecord, { maxLength: 12 });
