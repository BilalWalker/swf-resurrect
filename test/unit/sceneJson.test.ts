import { describe, expect, it } from 'vitest';
import type { DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';

function scene(): SceneJson {
  const entry: DisplayListEntry = {
    name: '',
    colorTransform: [1, 1, 1, 1, 0, 0, 0, 0],
    matrix: [1, 0, 0, 1, -0, 5],
    symbolId: 2,
    depth: 1,
  };
  return {
    symbols: {
      '2': { type: 'shape', origin: { y: 0, x: 1.5 }, file: '2.svg' },
      '10': { type: 'shape', origin: { x: 0, y: 0 }, file: '10.svg' },
      '0': { type: 'sprite', labels: [], frames: [[entry]], frameCount: 1 },
    },
    rootSymbolId: 0,
    stage: { width: 100, height: 50, backgroundColor: '#ffffff', frameRate: 24 },
    formatVersion: 1,
  };
}

describe('serialiseScene', () => {
  it('sorts keys by code unit, normalises -0, ends with one newline', () => {
    const text = serialiseScene(scene());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('-0');
    expect(text.indexOf('"10"')).toBeLessThan(text.indexOf('"2"'));
    expect(text.indexOf('"formatVersion"')).toBeLessThan(text.indexOf('"stage"'));
    expect(text).toContain('\n  "formatVersion": 1,');
    expect(text).not.toContain('\r');
  });

  it('round-trips through parseScene and is stable', () => {
    const text = serialiseScene(scene());
    expect(serialiseScene(parseScene(text))).toBe(text);
  });

  it('rejects non-finite numbers', () => {
    const s = scene();
    s.stage.width = Infinity;
    expect(() => serialiseScene(s)).toThrow();
  });
});
