import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { Player } from "../../template/runtime/player";
import type { SceneJson } from "../../template/runtime/scene";
import { FakeBackend } from "../support/fakeBackend";
import { registerClassName } from "../../template/shim/internal";
import { MovieClip } from "../../template/shim/MovieClip";
import { Shape } from "../../template/shim/Shape";
import { Sprite } from "../../template/shim/Sprite";
import { fcConfig } from "./config";

const ident = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/);
const qualifiedKey = fc
  .tuple(fc.array(ident, { maxLength: 3 }), ident)
  .map(([pkg, cls]) => ({ key: [...pkg, cls].join("."), cls }));
const shimKinds = [
  { make: () => new MovieClip(), name: "MovieClip" },
  { make: () => new Sprite(), name: "Sprite" },
  { make: () => new Shape(), name: "Shape" },
] as const;

describe("Property 52: Display objects print as [object ClassName]", () => {
  /** **Validates: Requirements 28.1, 28.7** */
  it("prints the unqualified registry key, also when the constructor's own name is replaced", () => {
    fc.assert(
      fc.property(qualifiedKey, fc.string(), ({ key, cls }, replacement) => {
        class Linked extends MovieClip {}
        registerClassName(Linked, key);
        Object.defineProperty(Linked, "name", { value: replacement });
        expect(String(new Linked())).toBe(`[object ${cls}]`);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 28.1, 28.7** */
  it("prints the Shim class name for the Shim classes, and the nearest registered ancestor for an unregistered subclass", () => {
    fc.assert(
      fc.property(fc.constantFrom(...shimKinds), fc.string(), (kind, replacement) => {
        const o = kind.make();
        Object.defineProperty(o.constructor, "name", { value: replacement, configurable: true });
        expect(String(o)).toBe(`[object ${kind.name}]`);
        class Helper extends (o.constructor as new () => Sprite) {}
        expect(String(new Helper())).toBe(`[object ${kind.name}]`);
      }),
      fcConfig,
    );
  });
});

type Node = { named: boolean; kind: "clip" | "shape"; children: Node[] };
const nodeArb: fc.Arbitrary<Node> = fc.letrec<{ node: Node }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.record({ named: fc.boolean(), kind: fc.constant("shape" as const), children: fc.constant([] as Node[]) }),
    fc.record({
      named: fc.boolean(),
      kind: fc.constant("clip" as const),
      children: fc.array(tie("node"), { maxLength: 3 }),
    }),
  ),
})).node;

describe("Property 51: Default instance names follow depth-first creation order", () => {
  /** **Validates: Requirements 28.2, 28.3, 28.4** */
  it("an unnamed clip or shape takes the next number in pre-order, the root takes 0, a named one takes none", () => {
    fc.assert(
      fc.property(fc.array(nodeArb, { maxLength: 4 }), (kids) => {
        const symbols: Record<string, unknown> = {};
        let next = 10;
        const entryFor = (n: Node, depth: number, idx: number): { entry: unknown; name: string } => {
          const name = n.named ? `n${next}` : "";
          let symbolId: number;
          if (n.kind === "shape") symbolId = 1;
          else {
            symbolId = next++;
            const frame = n.children.map((c, i) => entryFor(c, i + 1, i).entry);
            symbols[String(symbolId)] = { type: "sprite", frameCount: 1, frames: [frame], labels: [] };
          }
          if (n.kind === "shape") next++;
          return { entry: { depth, symbolId, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name }, name };
        };
        const rootFrame = kids.map((c, i) => entryFor(c, i + 1, i).entry);
        symbols["0"] = { type: "sprite", frameCount: 1, frames: [rootFrame], labels: [] };
        symbols["1"] = { type: "shape", file: "1.svg", origin: { x: 0, y: 0 } };
        const player = new Player({
          scene: { formatVersion: 1, stage: { width: 10, height: 10, backgroundColor: "#ffffff", frameRate: 10 }, rootSymbolId: 0, symbols } as SceneJson,
          backend: new FakeBackend(),
          clock: new ManualClock(),
          classRegistry: {},
          shapeBounds: new Map([[1, { x: 0, y: 0, width: 1, height: 1 }]]),
        });
        let counter = 1; // the root took 0
        const check = (parent: Sprite, nodes: Node[]): void => {
          nodes.forEach((n, i) => {
            const actual = parent.getChildAt(i);
            const expected = n.named ? actual.name : `instance${counter++}`;
            if (n.named) expect(actual.name).toMatch(/^n\d+$/);
            else expect(actual.name).toBe(expected);
            if (n.kind === "clip") check(actual as Sprite, n.children);
          });
        };
        expect(player.root.name).toBe("root1");
        check(player.root, kids);
      }),
      fcConfig,
    );
  });
});