import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseStructure } from "../../src/convert/ffdecXml";
import { fcConfig } from "./config";

function parseMatrix(attrs: string) {
  const xml = [
    '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="1" frameRate="24.0">',
    "<tags>",
    '<item type="PlaceObject2Tag" characterId="1" depth="1" placeFlagHasCharacter="true" placeFlagHasMatrix="true" placeFlagMove="false">',
    `<matrix type="MATRIX" ${attrs}/>`,
    "</item>",
    "</tags>",
    "</swf>",
  ].join("\n");
  const op = parseStructure(xml).root.ops.find((o) => o.kind === "place");
  if (!op || op.kind !== "place" || !op.matrix) throw new Error("no matrix");
  return op.matrix;
}

// Decimals with at most 6 fractional digits, so String(n) is a plain decimal (no exponent) and round-trips.
const decimal = fc.integer({ min: -9_000_000, max: 9_000_000 }).map((n) => n / 1_000_000);

describe("Property 1: Bug Condition - matrix scale and rotate fields are plain decimals", () => {
  /** **Validates: Requirements 2.1, 2.2** */
  it("hasScale/hasRotate true: output equals the input decimals", () => {
    fc.assert(
      fc.property(decimal, decimal, decimal, decimal, (sx, sy, r0, r1) => {
        const m = parseMatrix(
          `hasScale="true" hasRotate="true" scaleX="${sx}" scaleY="${sy}" rotateSkew0="${r0}" rotateSkew1="${r1}" translateX="0" translateY="0"`,
        );
        expect(m.a).toBeCloseTo(sx, 9);
        expect(m.d).toBeCloseTo(sy, 9);
        expect(m.b).toBeCloseTo(r0, 9);
        expect(m.c).toBeCloseTo(r1, 9);
      }),
      fcConfig,
    );
  });
});
