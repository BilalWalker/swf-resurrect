import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { Player } from "../../template/runtime/player";
import type { DisplayListEntry, SceneJson, SpriteSymbol } from "../../template/runtime/scene";
import { MovieClip } from "../../template/shim/MovieClip";
import { FakeBackend } from "../support/fakeBackend";
import { fcConfig } from "./config";
import { genSymbolGraph, type SymbolNode } from "./gen/genSymbolGraph";

const ID_CT: DisplayListEntry["colorTransform"] = [1, 1, 1, 1, 0, 0, 0, 0];

function entryFor(depth: number, node: SymbolNode): DisplayListEntry {
  return { depth, symbolId: node.id, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ID_CT, name: `c${node.id}` };
}

function collect(node: SymbolNode, out: SymbolNode[] = []): SymbolNode[] {
  out.push(node);
  for (const c of node.children) collect(c, out);
  return out;
}

/** The model: every child's field-initialiser and body markers precede its parent's, siblings in depth order. */
function expectedLog(node: SymbolNode): string[] {
  return [...node.children.flatMap(expectedLog), `field:${node.id}`, `body:${node.id}`];
}

describe("Construction_Bind", () => {
  /**
   * Property 45: Named children are bound before any derived code runs
   * **Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.12**
   */
  it("Property 45: named children are bound before any derived code runs", () => {
    fc.assert(
      fc.property(genSymbolGraph, (tree) => {
        const log: string[] = [];
        const unbound: string[] = [];
        const registry: Record<string, new () => MovieClip> = {};
        const symbols: SceneJson["symbols"] = {};
        for (const node of collect(tree)) {
          const names = node.children.map((c) => `c${c.id}`);
          registry[`C${node.id}`] = class extends MovieClip {
            // A TypeScript field initialiser: runs after super() returns, so the children are already bound.
            field = (log.push(`field:${node.id}`), names.every((n) => (this as any)[n] instanceof MovieClip));
            constructor() {
              super();
              log.push(`body:${node.id}`);
              if (!this.field) unbound.push(`field:${node.id}`);
              for (const n of names) if (!((this as any)[n] instanceof MovieClip)) unbound.push(`${node.id}.${n}`);
            }
          };
          const sym: SpriteSymbol = {
            type: "sprite",
            frameCount: 1,
            frames: [node.children.map((c, i) => entryFor(i + 1, c))],
            labels: [],
            className: `C${node.id}`,
          };
          symbols[String(node.id)] = sym;
        }
        const scene: SceneJson = {
          formatVersion: 2,
          stage: { width: 100, height: 100, backgroundColor: "#ffffff", frameRate: 10 },
          rootSymbolId: 0,
          symbols,
        };
        new Player({
          scene,
          backend: new FakeBackend(),
          clock: new ManualClock(),
          classRegistry: registry,
          shapeBounds: new Map(),
        });
        expect(unbound).toEqual([]);
        expect(log).toEqual(expectedLog(tree));
      }),
      fcConfig,
    );
  });
});
