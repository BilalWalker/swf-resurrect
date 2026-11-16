// Feature: as3-coverage, Property 16: textWidth grows with the text
// Validates: Requirements 15.10
import { afterAll, describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TextField } from '../../template/shim/TextField';
import { setTextMeasure } from '../../template/shim/textMeasure';
import { fcConfig } from './config';
describe('Property 16: textWidth grows with the text', () => {
  afterAll(() => setTextMeasure(null));
  it('the longer of two strings, one a prefix of the other, is at least as wide under a fixed width per character', () => {
    setTextMeasure((text) => text.length * 6);
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const shorter = new TextField();
        const longer = new TextField();
        shorter.text = a;
        longer.text = a + b;
        expect(longer.textWidth).toBeGreaterThanOrEqual(shorter.textWidth);
      }),
      fcConfig,
    );
  });
});