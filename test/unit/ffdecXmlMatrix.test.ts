import { describe, expect, it } from 'vitest';
import { parseStructure } from '../../src/convert/ffdecXml';
import type { MatrixModel } from '../../src/convert/model';

/** Wraps a <matrix> attribute string in the smallest dump parseStructure accepts. */
function dumpWithMatrix(matrixAttrs: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="1" frameRate="24.0">',
    '<tags>',
    '<item type="PlaceObject2Tag" characterId="1" depth="10" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagMove="false">',
    `<matrix type="MATRIX" ${matrixAttrs}/>`,
    '</item>',
    '<item type="ShowFrameTag"/>',
    '</tags>',
    '</swf>',
  ].join('\n');
}

function matrixOf(matrixAttrs: string): MatrixModel {
  const op = parseStructure(dumpWithMatrix(matrixAttrs)).root.ops.find((o) => o.kind === 'place');
  if (!op || op.kind !== 'place' || !op.matrix) throw new Error('no placement matrix parsed');
  return op.matrix;
}

describe('parseStructure matrix fields (bug condition: plain decimals)', () => {
  it('reads scaleX and scaleY as plain decimals', () => {
    const m = matrixOf('hasScale="true" hasRotate="false" scaleX="0.59999084" scaleY="0.59999084" translateX="1200" translateY="1800"');
    expect(m.a).toBeCloseTo(0.59999084, 8);
    expect(m.d).toBeCloseTo(0.59999084, 8);
  });

  it('reads rotateSkew0 and rotateSkew1 as plain decimals', () => {
    const m = matrixOf('hasScale="false" hasRotate="true" rotateSkew0="0.9781952" rotateSkew1="-0.2" translateX="0" translateY="0"');
    expect(m.b).toBeCloseTo(0.9781952, 8);
    expect(m.c).toBeCloseTo(-0.2, 8);
  });

  it('keeps translation in integer twips', () => {
    const m = matrixOf('hasScale="true" hasRotate="false" scaleX="0.5" scaleY="0.5" translateX="1200" translateY="1800"');
    expect(m.txTwips).toBe(1200);
    expect(m.tyTwips).toBe(1800);
  });

  // Guard: passes on unfixed code and must keep passing. A naive removal of the division
  // alone would turn the missing-attribute fallback into 65536.
  it('falls back to scale 1 when hasScale is true and scaleX/scaleY are missing', () => {
    const m = matrixOf('hasScale="true" hasRotate="false" translateX="0" translateY="0"');
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
  });

  it('falls back to skew 0 when hasRotate is true and the skew attributes are missing', () => {
    const m = matrixOf('hasScale="false" hasRotate="true" translateX="0" translateY="0"');
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
  });
});
