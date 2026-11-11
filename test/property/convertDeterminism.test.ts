import { existsSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { convertModel } from "../../src/convert/convertModel";
import { serialiseScene } from "../../src/convert/sceneJson";
import { serialiseUnsupported } from "../../src/pipeline/unsupported";
import type { TagsModel } from "../../src/convert/model";
import { fcConfig } from "./config";
import { genKeys, genTagsModel, permute } from "./gen/genTagsModel";

function observe(model: TagsModel): string {
  const r = convertModel(model);
  return JSON.stringify({
    scene: serialiseScene(r.scene),
    svg: r.svgFiles.map((f) => [f.fileName, f.content]),
    unsupported: serialiseUnsupported(r.unsupported),
    warnings: r.warnings,
    stats: r.stats,
  });
}

describe("Property 2: Conversion is deterministic and independent of list order", () => {
  /** **Validates: Requirements 4.8, 10.2** */
  it("gives identical output for repeated runs and permuted list orders", () => {
    fc.assert(
      fc.property(genTagsModel, genKeys, genKeys, genKeys, genKeys, genKeys, genKeys, (model, k1, k2, k3, k4, k5, k6) => {
        const first = observe(model);
        expect(observe(model)).toBe(first);
        const shuffled: TagsModel = {
          ...model,
          sprites: permute(model.sprites, k1),
          declaredShapeIds: permute(model.declaredShapeIds, k2),
          morphShapeIds: permute(model.morphShapeIds, k2),
          shapeAssets: permute(model.shapeAssets, k3),
          symbolClasses: permute(model.symbolClasses, k4),
          classSources: permute(model.classSources, k5),
          unsupported: permute(model.unsupported, k6),
        };
        expect(observe(shuffled)).toBe(first);
      }),
      fcConfig,
    );
  });
});

describe("Purity guard for converter files", () => {
  const files = [
    "src/convert/convertModel.ts",
    "src/convert/resolveTimeline.ts",
    "src/convert/sceneJson.ts",
    "src/emit/planEmit.ts",
  ].filter((f) => existsSync(f));

  const forbidden: Array<[string, RegExp]> = [
    ["node:fs", /node:fs/],
    ["node:child_process", /node:child_process/],
    ["Date", /\bDate\b/],
    ["Math.random", /Math\.random/],
    ["localeCompare", /localeCompare/],
  ];

  /** Remove comments so explanatory text does not trigger the guard. */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("checks the three always-present files", () => {
    expect(files).toEqual(expect.arrayContaining(["src/convert/convertModel.ts", "src/convert/resolveTimeline.ts", "src/convert/sceneJson.ts"]));
  });

  for (const file of files) {
    it(`${file} uses no filesystem, process, clock, randomness or locale calls`, () => {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const [name, re] of forbidden) {
        expect(re.test(code), `${file} must not use ${name}`).toBe(false);
      }
    });
  }
});
