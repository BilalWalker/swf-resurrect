import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractClassProperties } from '../../src/convert/classProps';
import { extractSvgOrigin } from '../../src/convert/svgOrigin';
import { formatSymbolsCsv, parseSymbolsCsv } from '../../src/convert/symbolsCsv';

const fx = (p: string) => readFileSync(new URL(`../fixtures/clickgoto/${p}`, import.meta.url), 'utf8');

describe('symbolsCsv', () => {
  it('parses the captured symbols.csv and round-trips it', () => {
    const entries = parseSymbolsCsv(fx('symbols.csv'));
    expect(entries).toEqual([
      { id: 6, className: 'LeftButton' },
      { id: 3, className: 'RightButton' },
      { id: 0, className: 'MainTimeline' },
    ]);
    expect(parseSymbolsCsv(formatSymbolsCsv(entries))).toEqual(entries);
  });
});

describe('extractSvgOrigin', () => {
  it('reads the numeric translation from the real FFDec matrix', () => {
    expect(extractSvgOrigin(fx('shapes/1.svg'))).toEqual({ x: 42.5, y: 40.5 });
  });
  it('accepts compact integer form and returns null without a matching group', () => {
    expect(extractSvgOrigin('<g transform="matrix(1,0,0,1,3,4)"/>')).toEqual({ x: 3, y: 4 });
    expect(extractSvgOrigin('<svg><path/></svg>')).toBeNull();
  });
});

describe('extractClassProperties', () => {
  it('finds no vars in LeftButton.as and skips Embed lines', () => {
    expect(extractClassProperties(fx('scripts/LeftButton.as'))).toEqual([]);
    expect(extractClassProperties('[Embed(source="a", var x)]\nvar foo:int;\npublic var $b;')).toEqual(['foo', '$b']);
  });
});
