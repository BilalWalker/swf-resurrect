import { describe, expect, it } from 'vitest';
import { measureSymbolClassSwf, symbolClassSwfSkipReason, type SymbolClassMeasure } from '../support/symbolClassSwf';

/**
 * Robustness task 25.1 (Requirement 26.1). The facts about FFDec's symbols.csv are measured on a
 * generated SWF, not guessed: see test/support/symbolClassSwf.ts for the lists it holds.
 */
const skip = symbolClassSwfSkipReason();
if (skip) console.warn(`symbolClassFixture: skipped, ${skip}`);

describe.skipIf(skip !== null)('symbolClass fixture (generated, measured)', () => {
  let m: SymbolClassMeasure;
  const get = (): SymbolClassMeasure => (m ??= measureSymbolClassSwf());

  it('the dump holds two SymbolClassTag items and one ExportAssetsTag', () => {
    const { dump } = get();
    expect(dump.match(/type="SymbolClassTag"/g)?.length).toBe(2);
    expect(dump.match(/type="ExportAssetsTag"/g)?.length).toBe(1);
  }, 120_000);

  it('the dump keeps the repeated id and the repeated pair', () => {
    const { dump } = get();
    expect(dump.match(/<item>A<\/item>/g)?.length).toBe(2);
    expect(dump.match(/<item>B<\/item>/g)?.length).toBe(1);
    expect(dump.match(/<item>Doc<\/item>/g)?.length).toBe(1);
    expect(dump.match(/<item>Extra<\/item>/g)?.length).toBe(1);
    expect(dump.match(/<item>ExportName<\/item>/g)?.length).toBe(1);
  }, 120_000);

  it('symbols.csv holds every class name of an id as its own line', () => {
    const lines = get().csvLines;
    for (const l of ['2;"A"', '2;"B"', '3;"C"', '3;"D"', '0;"Doc"', '0;"Extra"']) expect(lines).toContain(l);
  }, 120_000);

  it('symbols.csv repeats identical pairs (SymbolClass repeat, and an ExportAssets copy)', () => {
    const lines = get().csvLines;
    expect(lines.filter((l) => l === '2;"A"').length).toBeGreaterThanOrEqual(2);
    expect(lines.filter((l) => l === '3;"C"').length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('symbols.csv merges the ExportAssetsTag pair for an id that also has SymbolClass names', () => {
    expect(get().csvLines).toContain('2;"ExportName"');
  }, 120_000);

  it('symbols.csv is the SymbolClass pairs in tag order (repeats kept), then the ExportAssets pairs', () => {
    expect(get().csvLines).toEqual(['2;"A"', '2;"B"', '2;"A"', '3;"C"', '0;"Doc"', '0;"Extra"', '3;"D"', '2;"ExportName"', '3;"C"']);
  }, 120_000);
});