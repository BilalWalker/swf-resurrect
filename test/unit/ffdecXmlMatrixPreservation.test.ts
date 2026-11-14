import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { checkXmlVersion, parseStructure, readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { serialiseScene } from '../../src/convert/sceneJson';
import { XmlVersionError } from '../../src/unpack/errors';
import { placeItem, wrapDump } from '../support/matrixXml';

/**
 * Preservation (bugfix 3.1 to 3.6): behaviour for matrices without scale or rotate.
 * Observed on unfixed code; must keep passing after the fix.
 */

const dir = resolve(__dirname, '../fixtures/clickgoto');
const clickgotoXml = readFileSync(resolve(dir, 'structure.xml'), 'utf8');

function firstPlace(xml: string) {
  const op = parseStructure(xml).root.ops.find((o) => o.kind === 'place');
  if (!op || op.kind !== 'place') throw new Error('no place op');
  return op;
}

describe('matrix preservation (hasScale=false, hasRotate=false)', () => {
  it('gives identity scale and zero skew', () => {
    const op = firstPlace(wrapDump(placeItem('hasRotate="false" hasScale="false" translateX="100" translateY="-40"')));
    expect(op.matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, txTwips: 100, tyTwips: -40 });
  });

  it('passes translation through as integer twips', () => {
    const op = firstPlace(wrapDump(placeItem('hasRotate="false" hasScale="false" translateX="2870" translateY="5400"')));
    expect(op.matrix?.txTwips).toBe(2870);
    expect(op.matrix?.tyTwips).toBe(5400);
  });

  it('defaults missing translation to 0', () => {
    const op = firstPlace(wrapDump(placeItem('hasRotate="false" hasScale="false"')));
    expect(op.matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, txTwips: 0, tyTwips: 0 });
  });

  it('ignores scale attributes when hasScale=false', () => {
    const op = firstPlace(wrapDump(placeItem('hasRotate="false" hasScale="false" scaleX="0.5" scaleY="0.5" translateX="0" translateY="0"')));
    expect([op.matrix?.a, op.matrix?.d]).toEqual([1, 1]);
  });
});

describe('absent children (3.5)', () => {
  it('leaves matrix and colorTransform undefined when the placement has none', () => {
    const op = firstPlace(wrapDump(placeItem(null)));
    expect(op.matrix).toBeUndefined();
    expect(op.colorTransform).toBeUndefined();
  });

  it('leaves colorTransform undefined when only a matrix is present', () => {
    const op = firstPlace(wrapDump(placeItem('hasRotate="false" hasScale="false" translateX="0" translateY="0"')));
    expect(op.matrix).toBeDefined();
    expect(op.colorTransform).toBeUndefined();
  });

  it('clickgoto: the move placement without matrix has no matrix', () => {
    const s = parseStructure(clickgotoXml);
    const moves = s.sprites.flatMap((sp) => sp.ops).filter((o) => o.kind === 'place' && o.move);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      if (m.kind !== 'place') continue;
      expect(m.matrix).toBeUndefined();
      expect(m.colorTransform).toBeUndefined();
    }
  });

  it('clickgoto: every parsed matrix is a plain translation', () => {
    const s = parseStructure(clickgotoXml);
    const all = [...s.root.ops, ...s.sprites.flatMap((sp) => sp.ops)];
    for (const o of all) {
      if (o.kind === 'place' && o.matrix) {
        expect([o.matrix.a, o.matrix.b, o.matrix.c, o.matrix.d]).toEqual([1, 0, 0, 1]);
      }
    }
  });
});

describe('XML version (3.6)', () => {
  it('rejects a dump whose export major is not 4', () => {
    const changed = clickgotoXml.replace('_xmlExportMajor="4"', '_xmlExportMajor="5"');
    expect(changed).not.toBe(clickgotoXml);
    const { xmlVersion } = readDumpHeader(changed);
    expect(() => checkXmlVersion(xmlVersion)).toThrow(XmlVersionError);
  });

  it('accepts major 4', () => {
    expect(() => checkXmlVersion(readDumpHeader(clickgotoXml).xmlVersion)).not.toThrow();
  });
});

describe('clickgoto scene output (3.4)', () => {
  it('serialises byte-identical to the recorded pre-fix scene', async () => {
    const { xmlVersion, header } = readDumpHeader(clickgotoXml);
    const model = await readUnpacked({
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      textsDir: resolve(dir, 'texts'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: resolve(dir, 'symbols.csv'),
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    });
    const text = serialiseScene(convertModel(model).scene);
    const goldenPath = resolve(__dirname, '../fixtures/clickgoto/expected-scene.json');
    expect(existsSync(goldenPath)).toBe(true);
    expect(text).toBe(readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n'));
  });
});

