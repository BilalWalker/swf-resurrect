import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import type { CaughtError } from "../../template/runtime/errorReport";
import { Player } from "../../template/runtime/player";
import type { DisplayListEntry, SceneJson, SpriteSymbol } from "../../template/runtime/scene";
import { Event } from "../../template/shim/events";
import { MovieClip } from "../../template/shim/MovieClip";
import { FakeBackend } from "../support/fakeBackend";
import { fcConfig } from "./config";
import { genThrowingGraph, type SymbolNode, type ThrowFlags } from "./gen/genSymbolGraph";

const ID_CT: DisplayListEntry["colorTransform"] = [1, 1, 1, 1, 0, 0, 0, 0];
const TICKS = 2;

function collect(node: SymbolNode, out: SymbolNode[] = []): SymbolNode[] {
  out.push(node);
  for (const c of node.children) collect(c, out);
  return out;
}

function dump(clip: MovieClip, name: string): string {
  const kids = clip._children.map((k) => dump(k as MovieClip, k.name));
  return `${name}(${kids.join(",")})`;
}

interface Run {
  log: string[];
  errors: CaughtError[];
  shape: string;
}

/**
 * Builds the scene. With `replace` false the flagged elements throw; with it true each throw is replaced by an empty
 * element: a constructor throw in a field or before `super` becomes a constructor that does nothing more, a throw
 * in the body is dropped, and a throwing script or listener does nothing.
 */
function run(tree: SymbolNode, flags: ThrowFlags[], replace: boolean): Run {
  const log: string[] = [];
  const errors: CaughtError[] = [];
  const registry: Record<string, new () => MovieClip> = {};
  const symbols: SceneJson["symbols"] = {};
  for (const node of collect(tree)) {
    const f = flags[node.id];
    const id = node.id;
    const boom = (): never => {
      throw new Error(`boom ${id}`);
    };
    const skipBody = f.ctor === "field" || f.ctor === "pre";
    const preArg = (): undefined => (f.ctor === "pre" && !replace ? boom() : undefined);
    const fieldInit = (): boolean => (f.ctor === "field" && !replace ? boom() : true);
    registry[`C${id}`] = class extends MovieClip {
      field = fieldInit();
      constructor() {
        // @ts-expect-error: an argument expression that throws before the base constructor completes
        super(preArg());
        if (skipBody) return;
        this.addFrameScript(0, () => {
          if (f.script && !replace) boom();
          if (!f.script) log.push(`script:${id}`);
        });
        this.addEventListener(Event.ENTER_FRAME, () => {
          if (f.listener && !replace) boom();
          if (!f.listener) log.push(`listener:${id}`);
        });
        if (f.ctor === "body") {
          if (!replace) boom();
        } else {
          log.push(`ctor:${id}`);
        }
      }
    };
    const sym: SpriteSymbol = {
      type: "sprite",
      frameCount: 1,
      frames: [
        node.children.map((c, i) => ({
          depth: i + 1,
          symbolId: c.id,
          matrix: [1, 0, 0, 1, 0, 0],
          colorTransform: ID_CT,
          name: `c${c.id}`,
        })),
      ],
      labels: [],
      className: `C${id}`,
    };
    symbols[String(id)] = sym;
  }
  const scene: SceneJson = {
    formatVersion: 2,
    stage: { width: 100, height: 100, backgroundColor: "#ffffff", frameRate: 10 },
    rootSymbolId: 0,
    symbols,
  };
  const clock = new ManualClock();
  const player = new Player({
    scene,
    backend: new FakeBackend(),
    clock,
    classRegistry: registry,
    shapeBounds: new Map(),
    onCaughtError: (e) => errors.push(e),
  });
  for (let i = 0; i < TICKS; i++) {
    clock.advance(player.frameIntervalMs);
    player.update();
  }
  return { log, errors, shape: dump(player.root as MovieClip, "root") };
}

describe("Caught_Errors", () => {
  /**
   * Property 47: A throw never stops the movie and never changes the other elements
   * **Validates: Requirements 25.1, 25.2, 25.3, 25.11, 31.3**
   */
  it("Property 47: a throw never stops the movie and never changes the other elements", () => {
    fc.assert(
      fc.property(genThrowingGraph, ({ tree, flags }) => {
        const real = run(tree, flags, false);
        const reference = run(tree, flags, true);
        // The display tree is complete in both runs, and every other element has the same effects.
        expect(real.shape).toBe(reference.shape);
        expect(real.log).toEqual(reference.log);
        expect(reference.errors).toEqual([]);

        const nodes = collect(tree);
        const ctorErrors = nodes.filter((n) => flags[n.id].ctor !== "none").length;
        // A script and a listener exist only when the constructor body ran to its registrations.
        const registered = nodes.filter((n) => flags[n.id].ctor === "none" || flags[n.id].ctor === "body");
        const scriptErrors = registered.filter((n) => flags[n.id].script).length;
        const listenerErrors = registered.filter((n) => flags[n.id].listener).length * TICKS;
        const sites = real.errors.map((e) => e.site.split(" ")[0]);
        expect(sites.filter((s) => s === "constructor")).toHaveLength(ctorErrors);
        expect(sites.filter((s) => s === "frame")).toHaveLength(scriptErrors);
        expect(sites.filter((s) => s === "listener")).toHaveLength(listenerErrors);
        expect(real.errors).toHaveLength(ctorErrors + scriptErrors + listenerErrors);
      }),
      fcConfig,
    );
  });
});
