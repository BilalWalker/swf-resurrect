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
      '2': { type: 'shape', origin: { y: 0, x: 1.5 }, file: '2.shape.json', size: { width: 3, height: 4 } },
      '10': { type: 'shape', origin: { x: 0, y: 0 }, file: '10.shape.json', size: { width: 0, height: 0 } },
      '0': { type: 'sprite', labels: [], frames: [[entry]], frameCount: 1 },
    },
    rootSymbolId: 0,
    stage: { width: 100, height: 50, backgroundColor: '#ffffff', frameRate: 24 },
    formatVersion: 2,
  };
}

describe('serialiseScene', () => {
  it('sorts keys by code unit, normalises -0, ends with one newline', () => {
    const text = serialiseScene(scene());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('-0');
    expect(text.indexOf('"10"')).toBeLessThan(text.indexOf('"2"'));
    expect(text.indexOf('"formatVersion"')).toBeLessThan(text.indexOf('"stage"'));
    expect(text).toContain('\n  "formatVersion": 2,');
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

describe('Scene_JSON v2 validation', () => {
  const rejects = (mutate: (s: SceneJson) => void, path: string): void => {
    const s = scene();
    mutate(s);
    expect(() => parseScene(JSON.stringify(s))).toThrow(path);
  };

  it('rejects a clipDepth below the entry depth, with the field path', () => {
    rejects((s) => {
      const root = s.symbols['0'];
      if (root?.type === 'sprite') root.frames[0]![0]!.clipDepth = 0;
    }, 'symbols[0].frames[0][0].clipDepth');
  });

  it('rejects a non-integer clipDepth, with the field path', () => {
    rejects((s) => {
      const root = s.symbols['0'];
      if (root?.type === 'sprite') root.frames[0]![0]!.clipDepth = 2.5;
    }, 'symbols[0].frames[0][0].clipDepth');
  });

  it('accepts a clipDepth equal to or above the entry depth', () => {
    const s = scene();
    const root = s.symbols['0'];
    if (root?.type === 'sprite') root.frames[0]![0]!.clipDepth = 1;
    expect(() => parseScene(JSON.stringify(s))).not.toThrow();
  });

  it('rejects formatVersion 1, with the field path', () => {
    const s = JSON.parse(JSON.stringify(scene())) as { formatVersion: number };
    s.formatVersion = 1;
    expect(() => parseScene(JSON.stringify(s))).toThrow('formatVersion');
  });

  it('rejects a shape file named <id>.svg and a negative size', () => {
    rejects((s) => {
      const sym = s.symbols['2'];
      if (sym?.type === 'shape') sym.file = '2.svg';
    }, 'symbols[2].file');
    rejects((s) => {
      const sym = s.symbols['2'];
      if (sym?.type === 'shape') sym.size.width = -1;
    }, 'symbols[2].size.width');
  });
});
