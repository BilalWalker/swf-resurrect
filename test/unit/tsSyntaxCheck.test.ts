import { describe, expect, it } from 'vitest';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

describe('tsSyntaxCheck', () => {
  it('accepts valid TypeScript', () => {
    expect(tsSyntaxCheck('export class A {\n  x: number = 1;\n}\n')).toEqual([]);
  });

  it('reports a syntax error with a 1-based line', () => {
    const errors = tsSyntaxCheck('const a = 1;\nconst b = ;\n');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.line).toBe(2);
  });
});
