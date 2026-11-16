// RenderBackend.setText on the FakeBackend (as3-coverage task 16.2). Validates: Requirements 15.5
import { describe, expect, it } from 'vitest';
import { FakeBackend } from '../support/fakeBackend';
describe('FakeBackend.setText', () => {
  it('stores a copy of the text draw and clears it with null', () => {
    const b = new FakeBackend();
    const n = b.createContainer();
    const draw = { text: 'abc', color: 0x00ff00, width: 100, height: 100 };
    b.setText(n, draw);
    draw.text = 'changed';
    expect(n.text).toEqual({ text: 'abc', color: 0x00ff00, width: 100, height: 100 });
    b.setText(n, null);
    expect(n.text).toBeNull();
  });
});