// Byte identity of the translated fixture classes through the full planner (Requirement 22.9).
// Implicit this resolution and method-value binding must not change a byte of clickgoto or tweendemo.
// Validates: Requirements 22.9, 18.15
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { planTranslate } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

vi.setConfig({ testTimeout: 60_000 });

const scene = (names: string[]) =>
  ({
    formatVersion: 1,
    rootSymbolId: 0,
    symbols: Object.fromEntries(names.map((c, i) => [String(i), { type: 'sprite', frames: [], labels: {}, className: c }])),
  }) as never;

describe('translated fixture text through planTranslate (Requirement 22.9)', () => {
  for (const sample of ['clickgoto', 'tweendemo']) {
    it(`${sample}: every class equals the committed fixture, byte for byte`, () => {
      const dir = `test/fixtures/${sample}`;
      const names = readdirSync(`${dir}/scripts`).map((n) => n.slice(0, -3));
      expect(names.length).toBeGreaterThan(0);
      const sources = names.map((n) => ({ className: n, source: readFileSync(`${dir}/scripts/${n}.as`, 'utf8') }));
      const plan = planTranslate(sources, scene(names), tsSyntaxCheck);
      expect(plan.classes.map((c) => c.className).sort()).toEqual([...names].sort());
      for (const c of plan.classes) {
        expect(c.text).toBe(readFileSync(`${dir}/translated/${c.className}.ts.txt`, 'utf8'));
      }
    });
  }
});
