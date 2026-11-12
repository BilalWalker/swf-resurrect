import * as fc from 'fast-check';

export interface GenEntry {
  type: 'Wait' | 'MouseMove' | 'MouseDown' | 'MouseUp' | 'Unsupported';
  btn?: 'Left' | 'Right';
  pos?: [number, number];
}

const posArb = fc.tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 300 })) as fc.Arbitrary<
  [number, number]
>;

export const referenceEntryArb: fc.Arbitrary<GenEntry> = fc.oneof(
  fc.constant<GenEntry>({ type: 'Wait' }),
  posArb.map((pos): GenEntry => ({ type: 'MouseMove', pos })),
  posArb.map((pos): GenEntry => ({ type: 'MouseDown', btn: 'Left', pos })),
  posArb.map((pos): GenEntry => ({ type: 'MouseUp', btn: 'Left', pos })),
  fc.constant<GenEntry>({ type: 'Unsupported' }),
  posArb.map((pos): GenEntry => ({ type: 'MouseDown', btn: 'Right', pos })),
);

export const referenceInputArb: fc.Arbitrary<GenEntry[]> = fc.array(referenceEntryArb, { maxLength: 40 });
