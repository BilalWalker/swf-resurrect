import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { convertModel } from "../../src/convert/convertModel";
import { UnknownSymbolError } from "../../src/convert/errors";
import type { TagsModel } from "../../src/convert/model";
import { fcConfig } from "./config";
import { genTagsModel } from "./gen/genTagsModel";

/** Ids whose placements are dropped: everything that is not a shape or a sprite. */
function droppedIds(m: TagsModel): Set<number> {
  const shapes = new Set(m.declaredShapeIds);
  const sprites = new Set(m.sprites.map((s) => s.id));
  const ids = new Set<number>();
  for (const id of m.morphShapeIds) ids.add(id);
  const drawnText = new Set(m.textAssets.map((a) => a.id));
  for (const id of m.staticTextIds) if (!drawnText.has(id)) ids.add(id);
  for (const id of m.bitmapIds) ids.add(id);
  for (const o of m.unsupported) if (o.characterId !== undefined) ids.add(o.characterId);
  for (const id of [...ids]) if (shapes.has(id) || sprites.has(id)) ids.delete(id);
  return ids;
}

function countDroppedPlacements(m: TagsModel): number {
  const ids = droppedIds(m);
  let n = 0;
  for (const t of [m.root, ...m.sprites]) {
    for (const op of t.ops) {
      if (op.kind === "place" && op.characterId !== undefined && ids.has(op.characterId)) n += 1;
    }
  }
  return n;
}

describe("Property 10: Convert never aborts on a defined character and counts every drop", () => {
  /** **Validates: Requirements 5.3, 5.4, 5.6, 9.6, 11.1, 11.4, 15.5** */
  it("does not throw and records one entry per dropped placement", () => {
    fc.assert(
      fc.property(genTagsModel, (model) => {
        const r = convertModel(model);
        const drops = r.unsupported.filter((u) => u.context !== undefined && u.kind !== "filter" && u.kind !== "blend-mode");
        expect(drops.length).toBe(countDroppedPlacements(model));
        for (const d of drops) {
          expect(d.context).toMatchObject({ spriteId: expect.any(Number), frame: expect.any(Number), depth: expect.any(Number) });
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 13.1, 13.2, 13.3, 2.5** */
  it("keeps filtered and blend-mode placements and records one limit per flag, never a drop", () => {
    fc.assert(
      fc.property(genTagsModel, (model) => {
        const r = convertModel(model);
        const ids = droppedIds(model);
        let filters = 0;
        let blends = 0;
        let placed = 0;
        for (const t of [model.root, ...model.sprites]) {
          for (const op of t.ops) {
            if (op.kind !== "place" || op.characterId === undefined || ids.has(op.characterId)) continue;
            placed += 1;
            if (op.hasFilters) filters += 1;
            if (op.hasBlendMode) blends += 1;
          }
        }
        const kept = r.unsupported.filter((u) => u.kind === "filter" || u.kind === "blend-mode");
        expect(kept.filter((u) => u.kind === "filter")).toHaveLength(filters);
        expect(kept.filter((u) => u.kind === "blend-mode")).toHaveLength(blends);
        for (const u of kept) expect(u.context).toBeDefined();
        // Every placement of a drawable character is still in the Scene_JSON.
        let inScene = 0;
        for (const s of Object.values(r.scene.symbols)) if (s.type === "sprite") for (const f of s.frames) inScene += f.length;
        expect(inScene).toBe(placed);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 10.2, 10.3, 10.5** */  it("draws static text as a shape symbol with one text-metrics entry and no drop", () => {
    fc.assert(
      fc.property(genTagsModel, (model) => {
        const r = convertModel(model);
        for (const a of model.textAssets) {
          expect(r.scene.symbols[String(a.id)]).toMatchObject({ type: "shape", file: `${a.id}.shape.json` });
          expect(r.shapeFiles.some((f) => f.fileName === `${a.id}.shape.json`)).toBe(true);
        }
        const metrics = r.unsupported.filter((u) => u.kind === "text-metrics");
        expect(metrics.map((u) => u.id).sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual(model.textAssets.map((a) => a.id).sort((x, y) => x - y));
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 5.3, 5.6** */
  it("throws UnknownSymbolError for a placed id nobody defines", () => {
    fc.assert(
      fc.property(genTagsModel, (model) => {
        const bad: TagsModel = {
          ...model,
          root: {
            ...model.root,
            ops: [{ kind: "place", depth: 99, characterId: 100000, move: false }, ...model.root.ops],
          },
        };
        expect(() => convertModel(bad)).toThrow(UnknownSymbolError);
      }),
      fcConfig,
    );
  });
});
