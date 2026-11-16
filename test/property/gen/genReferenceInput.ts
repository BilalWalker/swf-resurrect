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

export type KeyEntry =
  | { type: 'KeyDown' | 'KeyUp'; key: string | { Char: string } }
  | { type: 'Wait' };
const keyArb: fc.Arbitrary<string | { Char: string }> = fc.oneof(
  fc.constantFrom('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Space'),
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')).map((c) => ({ Char: c })),
);
/** Key and Wait entries; a list that ends with a Wait after a non-empty group is excluded (the plan drops it). */
export const keyInputArb: fc.Arbitrary<KeyEntry[]> = fc
  .array(
    fc.oneof(
      { weight: 1, arbitrary: fc.constant<KeyEntry>({ type: 'Wait' }) },
      { weight: 3, arbitrary: fc.tuple(fc.constantFrom('KeyDown' as const, 'KeyUp' as const), keyArb).map(([type, key]): KeyEntry => ({ type, key })) },
    ),
    { maxLength: 30 },
  )
  .filter((l) => {
    const n = l.length;
    return !(n >= 2 && l[n - 1]!.type === 'Wait' && l[n - 2]!.type !== 'Wait');
  });
