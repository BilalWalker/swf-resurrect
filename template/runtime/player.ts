import type { DisplayObject } from '../shim/DisplayObject';
import { MouseEvent } from '../shim/events';
import {
  exitFrame,
  withConstructionContext,
  type ClipHooks,
  type ConstructionContext,
} from '../shim/internal';
import { MovieClip } from '../shim/MovieClip';
import type { DisplayObjectContainer } from '../shim/Sprite';
import type { NodeHandle, RenderBackend, ShapeBounds } from './backend';
import type { Clock } from './clock';
import { hitTest } from './hitTest';
import type { ColorTransform8, DisplayListEntry, SceneJson, SpriteSymbol } from './scene';
import { ScriptQueue } from './scriptQueue';
import { buildHitView, decomposeMatrix, NodeRegistry, ShapeObject } from './stageTree';

export interface PlayerOptions {
  scene: SceneJson;
  backend: RenderBackend;
  clock: Clock;
  classRegistry: Record<string, new () => MovieClip>;
  /** Result of loading all shapes. */
  shapeBounds: ReadonlyMap<number, ShapeBounds>;
  /** Most whole frame steps one update() may run; extra time is dropped. Default 5. */
  maxCatchUpFrames?: number;
}

const EPSILON_MS = 1e-9;
const DEFAULT_MAX_CATCH_UP = 5;

function isIdentityColor(ct: Readonly<ColorTransform8>): boolean {
  return ct[0] === 1 && ct[1] === 1 && ct[2] === 1 && ct[3] === 1 && ct[4] === 0 && ct[5] === 0 && ct[6] === 0 && ct[7] === 0;
}

export class Player {
  readonly root: MovieClip;
  readonly frameIntervalMs: number;

  private readonly scene: SceneJson;
  private readonly backend: RenderBackend;
  private readonly clock: Clock;
  private readonly classRegistry: Record<string, new () => MovieClip>;
  private readonly maxCatchUp: number;
  private readonly scripts = new ScriptQueue();
  private readonly nodes = new NodeRegistry();
  private readonly hooks: ClipHooks;
  private readonly reportedMissing = new Set<number>();
  private readonly shapeBounds: ReadonlyMap<number, ShapeBounds>;
  private warnedSkew = false;
  private lastNow: number;
  private accumulator = 0;

  constructor(options: PlayerOptions) {
    this.backend = options.backend;
    this.clock = options.clock;
    this.classRegistry = options.classRegistry;
    this.shapeBounds = options.shapeBounds;
    this.maxCatchUp = Math.max(1, options.maxCatchUpFrames ?? DEFAULT_MAX_CATCH_UP);
    this.frameIntervalMs = 1000 / options.scene.stage.frameRate;
    this.scene = this.withoutUnrenderableEntries(options.scene);
    this.hooks = {
      createChild: (entry) => this.createChild(entry),
      childAttached: (parent, child, index) => this.attach(parent, child, index),
      childDetached: (parent, child) => this.detach(parent, child),
      applyMatrix: (child, m) => this.applyMatrix(child, m),
      applyColorTransform: (child, ct) => this.applyColor(child, ct),
    };
    this.lastNow = this.clock.now();

    const rootSymbol = this.scene.symbols[String(this.scene.rootSymbolId)];
    if (rootSymbol === undefined || rootSymbol.type !== 'sprite') {
      throw new Error(`Player: root symbol ${this.scene.rootSymbolId} is not a sprite`);
    }
    this.root = this.createClip(this.scene.rootSymbolId, rootSymbol);
    this.syncAll();
  }

  /** Backend node of the root clip; the adapter adds it to the stage. */
  get rootNode(): NodeHandle {
    return this.nodes.nodeOf(this.root);
  }

  /** Reads the clock and runs whole frame steps. */
  update(): void {
    const now = this.clock.now();
    this.accumulator += Math.max(0, now - this.lastNow);
    this.lastNow = now;

    let steps = 0;
    while (this.accumulator >= this.frameIntervalMs - EPSILON_MS && steps < this.maxCatchUp) {
      this.accumulator -= this.frameIntervalMs;
      steps++;
      this.root._step();
      exitFrame(this.root);
    }
    if (this.accumulator >= this.frameIntervalMs - EPSILON_MS) {
      // Stalled for longer than the cap allows: drop the rest.
      this.accumulator %= this.frameIntervalMs;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.syncAll();
  }

  /** Hit tests the stage point, then delivers a click to the target and each ancestor. */
  dispatchClick(stageX: number, stageY: number): void {
    const hit = hitTest(buildHitView(this.root), stageX, stageY);
    if (hit === null) return;
    const target = hit.source;
    const e = new MouseEvent(MouseEvent.CLICK);
    // dispatchEvent rewrites target; keep the hit object as the target through the bubbling.
    Object.defineProperty(e, 'target', { get: () => target, set: () => undefined, configurable: true });
    for (let cur: DisplayObject | null = target; cur !== null; cur = cur._parent) {
      cur.dispatchEvent(e);
    }
    this.syncAll();
  }

  // ---- instance creation ----

  private createClip(symbolId: number, symbol: SpriteSymbol): MovieClip {
    const ctx: ConstructionContext = { symbol, symbolId, scripts: this.scripts, hooks: this.hooks };
    let Cls: new () => MovieClip = MovieClip;
    if (symbol.className !== undefined) {
      const linked = this.classRegistry[symbol.className];
      if (linked !== undefined) Cls = linked;
      else console.warn(`Player: class "${symbol.className}" is not in the registry; using MovieClip`);
    }
    const mc = withConstructionContext(ctx, () => new Cls());
    this.nodes.register(mc, this.backend.createContainer());
    // Frame 1: creates and binds the children (named children are exposed as properties as they are made).
    mc._renderFrame();
    this.scripts.enqueue(mc, 1);
    this.scripts.drain();
    return mc;
  }

  private createChild(entry: DisplayListEntry): DisplayObject {
    const symbol = this.scene.symbols[String(entry.symbolId)];
    if (symbol === undefined) throw new Error(`Player: unknown symbol ${entry.symbolId}`);
    if (symbol.type === 'sprite') return this.createClip(entry.symbolId, symbol);
    const bounds = this.shapeBounds.get(entry.symbolId);
    if (bounds === undefined) throw new Error(`Player: no bounds for shape ${entry.symbolId}`);
    const shape = new ShapeObject(entry.symbolId, bounds);
    this.nodes.register(shape, this.backend.createShape(entry.symbolId));
    return shape;
  }

  // ---- hooks ----

  private attach(parent: DisplayObjectContainer, _child: DisplayObject, _index: number): void {
    // Rebuilds the node order from the shim child list, so scripted children stay above lower timeline ones.
    this.reconcile(parent);
  }

  /**
   * Makes the backend children of `parent` match `parent._children`: creates nodes for
   * children added by script, removes nodes of children removed by script, fixes order.
   */
  private reconcile(parent: DisplayObjectContainer): void {
    const pNode = this.nodes.nodeOf(parent);
    if (pNode === undefined) return;
    const want = parent._children;
    const have = this.attachedOrder.get(parent) ?? [];
    if (have.length === want.length && have.every((c, i) => c === want[i])) return;
    for (const c of have) {
      if (want.includes(c)) continue;
      const n = this.nodes.nodeOf(c);
      if (n !== undefined) this.backend.removeChild(pNode, n);
    }
    want.forEach((c, i) => {
      let n = this.nodes.nodeOf(c);
      if (n === undefined) {
        n = this.backend.createContainer();
        this.nodes.register(c, n);
        this.backend.setTransform(n, { x: c.x, y: c.y, scaleX: c.scaleX, scaleY: c.scaleY, rotationDeg: c.rotation });
        this.backend.setAlpha(n, c.alpha);
        this.backend.setVisible(n, c.visible);
      }
      this.backend.addChildAt(pNode, n, i);
    });
    this.attachedOrder.set(parent, want.slice());
  }

  /** Reconciles node lists for the whole tree, then pushes script-changed properties. */
  private syncAll(): void {
    const walk = (o: DisplayObject): void => {
      const kids = (o as Partial<DisplayObjectContainer>)._children;
      if (kids === undefined) return;
      this.reconcile(o as DisplayObjectContainer);
      for (const k of [...kids]) walk(k);
    };
    walk(this.root);
    this.nodes.syncTree(this.backend, this.root);
  }

  private readonly attachedOrder = new WeakMap<DisplayObject, DisplayObject[]>();

  /** Destroys the child's node; the backend releases the subtree below it with it. */
  private detach(parent: DisplayObjectContainer, child: DisplayObject): void {
    const p = this.nodes.nodeOf(parent);
    const c = this.nodes.nodeOf(child);
    const order = this.attachedOrder.get(parent);
    if (order !== undefined) this.attachedOrder.set(parent, order.filter((o) => o !== child));
    if (c === undefined) return;
    if (p !== undefined) this.backend.removeChild(p, c);
    this.backend.destroyNode(c);
  }

  private applyMatrix(child: DisplayObject, m: DisplayListEntry['matrix']): void {
    const { t, skewed } = decomposeMatrix(m);
    if (skewed && !this.warnedSkew) {
      this.warnedSkew = true;
      console.warn('Player: a matrix with skew is approximated by scale and rotation');
    }
    this.nodes.applyTransform(this.backend, child, t);
  }

  private applyColor(child: DisplayObject, ct: DisplayListEntry['colorTransform']): void {
    const node = this.nodes.nodeOf(child);
    if (node === undefined) return;
    if (ct[4] !== 0 || ct[5] !== 0 || ct[6] !== 0 || ct[7] !== 0) this.backend.warnColorOffsetsUnsupported?.();
    // Identity on a fresh node needs no call; a change back to identity is an explicit call from a later entry.
    if (isIdentityColor(ct) && !this.coloured.has(child)) return;
    this.coloured.add(child);
    this.backend.setColorMultiplier(node, ct[0], ct[1], ct[2], ct[3]);
  }

  private readonly coloured = new WeakSet<DisplayObject>();

  // ---- scene preparation ----

  /**
   * Copy of the scene without entries that cannot be drawn: unknown symbols and
   * shapes with no bounds. Each missing shape is reported once.
   */
  private withoutUnrenderableEntries(scene: SceneJson): SceneJson {
    const symbols: SceneJson['symbols'] = {};
    for (const [key, sym] of Object.entries(scene.symbols)) {
      if (sym.type === 'shape') {
        symbols[key] = sym;
        continue;
      }
      symbols[key] = {
        ...sym,
        frames: sym.frames.map((frame) => frame.filter((entry) => this.canRender(scene, entry))),
      };
    }
    return { ...scene, symbols };
  }

  private canRender(scene: SceneJson, entry: DisplayListEntry): boolean {
    const target = scene.symbols[String(entry.symbolId)];
    if (target === undefined) return false;
    if (target.type === 'sprite') return true;
    if (this.shapeBounds.has(entry.symbolId)) return true;
    if (!this.reportedMissing.has(entry.symbolId)) {
      this.reportedMissing.add(entry.symbolId);
      this.backend.showError(`SVG asset ${target.file} is not loaded; entries using it are skipped`);
    }
    return false;
  }
}
