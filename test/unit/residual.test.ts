import { describe, it, expect } from 'vitest';
import {
  ResidualRegisterError,
  attributeRegions,
  residualLimits,
  validateResidualRegister,
} from '../../src/verify/core/residual';
import type { DiffRegion } from '../../src/verify/core/regions';

// The example register of the design, Data Models section.
const EXAMPLE: unknown = JSON.parse(
  '{ "formatVersion": 1, "sample": "3_joystick", "entries": [' +
    '{ "frame": 1, "bbox": { "x0": 0, "y0": 0, "x1": 0, "y1": 0 }, "kind": "example-kind", "message": "what differs in the render" }' +
    '] }',
);

const region = (id: number, x0: number, y0: number, x1: number, y1: number): DiffRegion => ({
  id,
  bbox: { x0, y0, x1, y1 },
  pixels: 1,
  first: { x: x0, y: y0 },
});

describe('residual register', () => {
  it('parses the example register of the design', () => {
    expect(() => validateResidualRegister(EXAMPLE)).not.toThrow();
    expect(() => validateResidualRegister(EXAMPLE, { width: 1, height: 1 })).not.toThrow();
  });

  it('names the failing field', () => {
    const bad = (patch: object, stage?: { width: number; height: number }): string => {
      const reg = JSON.parse(JSON.stringify(EXAMPLE)) as { entries: Record<string, unknown>[] };
      Object.assign(reg.entries[0]!, patch);
      try {
        validateResidualRegister(reg, stage);
      } catch (e) {
        expect(e).toBeInstanceOf(ResidualRegisterError);
        return (e as Error).message;
      }
      return '';
    };
    expect(bad({ kind: 'Bad Kind' })).toMatch(/^entries\[0\]\.kind/);
    expect(bad({ frame: 1.5 })).toMatch(/^entries\[0\]\.frame/);
    expect(bad({ message: 'ToDo' })).toMatch(/^entries\[0\]\.message/);
    expect(bad({ bbox: { x0: 0, y0: 0, x1: 1, y1: 0 } }, { width: 1, height: 1 })).toMatch(/^entries\[0\]\.bbox\.x1/);
  });

  it('attributes to the smallest containing entry of the same frame', () => {
    const reg = {
      formatVersion: 1 as const,
      sample: 's',
      entries: [
        { frame: 1, bbox: { x0: 0, y0: 0, x1: 9, y1: 9 }, kind: 'big', message: 'm' },
        { frame: 1, bbox: { x0: 2, y0: 2, x1: 3, y1: 3 }, kind: 'small', message: 'm' },
        { frame: 2, bbox: { x0: 2, y0: 2, x1: 2, y1: 2 }, kind: 'other-frame', message: 'm' },
      ],
    };
    const a = attributeRegions(1, [region(1, 2, 2, 2, 2), region(2, 5, 5, 6, 6), region(3, 8, 8, 12, 12)], reg);
    expect(a.map((x) => x.entry?.kind ?? null)).toEqual(['small', 'big', null]);
    expect(attributeRegions(1, [region(1, 0, 0, 0, 0)], null)[0]!.entry).toBeNull();
    expect(residualLimits(a).map((l) => l.kind)).toEqual(['residual-difference', 'residual-difference']);
  });
});
