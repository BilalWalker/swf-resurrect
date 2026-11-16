// Import-cycle hazard analysis (as3-coverage task 5.1, Requirement 37.2, 37.5). Fixture graphs only.
import { describe, expect, it } from 'vitest';
import { findImportCuts, type ImportEdge } from '../../src/translate/initHazards';

const e = (from: string, to: string, cuttable = true): ImportEdge => ({ from, to, cuttable });
const bases = (pairs: Array<[string, string]>): Map<string, string> => new Map(pairs);

describe('findImportCuts', () => {
  it('cuts the base import of a two-class cycle', () => {
    // Fly extends Base; Base imports Fly in a method.
    const r = findImportCuts({ bases: bases([['Fly', 'Base']]), edges: [e('Fly', 'Base', false), e('Base', 'Fly')] });
    expect(r.cuts).toEqual([{ from: 'Base', to: 'Fly' }]);
    expect(r.problems).toEqual([]);
  });

  it('cuts the base import on the shortest path of a three-class cycle', () => {
    const r = findImportCuts({
      bases: bases([['Fly', 'Base']]),
      edges: [e('Fly', 'Base', false), e('Base', 'Scene'), e('Scene', 'Fly')],
    });
    expect(r.cuts).toEqual([{ from: 'Base', to: 'Scene' }]);
  });

  it('names the problem and keeps the class when no import can be cut', () => {
    const r = findImportCuts({
      bases: bases([['Fly', 'Base']]),
      edges: [e('Fly', 'Base', false), e('Base', 'Scene', false), e('Scene', 'Fly', false)],
    });
    expect(r.cuts).toEqual([]);
    expect(r.problems).toEqual([{ className: 'Fly', path: ['Base', 'Scene', 'Fly'] }]);
  });

  it('falls back to a cuttable import deeper on the path', () => {
    const r = findImportCuts({
      bases: bases([['Fly', 'Base']]),
      edges: [e('Fly', 'Base', false), e('Base', 'Scene', false), e('Scene', 'Fly')],
    });
    expect(r.cuts).toEqual([{ from: 'Scene', to: 'Fly' }]);
    expect(r.problems).toEqual([]);
  });

  it('reports nothing when the base does not reach the class', () => {
    const r = findImportCuts({ bases: bases([['Fly', 'Base']]), edges: [e('Fly', 'Base', false), e('Fly', 'Scene')] });
    expect(r).toEqual({ cuts: [], problems: [] });
  });

  it('breaks a tie by the lexicographically first import', () => {
    const r = findImportCuts({
      bases: bases([['Fly', 'Base']]),
      edges: [e('Fly', 'Base', false), e('Base', 'Zed'), e('Base', 'Alpha'), e('Alpha', 'Fly'), e('Zed', 'Fly')],
    });
    // Both paths have length 2; the first cut breaks one, the loop cuts the other.
    expect(r.cuts).toEqual([{ from: 'Base', to: 'Alpha' }, { from: 'Base', to: 'Zed' }]);
  });
});
