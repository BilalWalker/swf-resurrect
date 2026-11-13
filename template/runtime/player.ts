import type { DisplayObject } from '../shim/DisplayObject';
import { Event, MouseEvent } from '../shim/events';
import {
  attachRoot,
  buildFrameOne,
  clipsPostOrder,
  clipsPreOrder,
  exitFrame,
  frameConstructed,
  reportCaughtError,
  setCaughtErrorSink,
  setContextForConstructor,
  setPointerPosition,
  withConstructionContext,
  type ClipCycle,
  type ClipHooks,
  type ConstructionContext,
} from '../shim/internal';
import { MovieClip } from '../shim/MovieClip';
import { DisplayObjectContainer, Sprite } from '../shim/Sprite';
import { isStage, Stage } from '../shim/Stage';
import type { NodeHandle, RenderBackend, ShapeBounds } from './backend';
import type { Clock } from './clock';
import { constructorSite, messageOf, type ErrorSink } from './errorReport';
import { hitTest } from './hitTest';
import type { ColorTransform8, DisplayListEntry, SceneJson, SpriteSymbol } from './scene';
import { ScriptQueue } from './scriptQueue';
import { buildHitView, decomposeMatrix, NodeRegistry, ShapeObject } from './stageTree';

export interface PlayerOptions {
  scene: SceneJson;
  backend: RenderBackend;
  clock: Clock;
  classRegistry: Record<string, new (...args: any[]) => Sprite>;
  /** Result of loading all shapes. */
  shapeBounds: ReadonlyMap<number, ShapeBounds>;
  /** Most whole frame steps one update() may run; extra time is dropped. Default 5. */
  maxCatchUpFrames?: number;
  /** Receives each Caught_Error once (Requirement 25.5); absent: console.error. */
  onCaughtError?: ErrorSink;
}

/** A Hit_Target: a display object, or the Stage_Object when nothing is hit. */
export type PointerTarget = DisplayObject | Stage;

export interface PointerOutcome {
  /** Set when a Pressed_Target existed and the Hit_Target at release was another object. */
  releaseOutside: { pressed: PointerTarget; hit: PointerTarget } | null;
}

const EPSILON_MS = 1e-9;
const DEFAULT_MAX_CATCH_UP = 5;
const ROOT_NAME = 'root1';

/**
 * The Hit_Target for a hit object: its nearest ancestor-or-self that is a Sprite or MovieClip (the Shim's only
 * InteractiveObject kinds; both extend DisplayObjectContainer, Shape does not). null when there is none.
 */
function interactiveTarget(hit: DisplayObject | undefined): DisplayObjectContainer | null {
  for (let o: unknown = hit; o !== null && o !== undefined && !isStage(o); o = (o as DisplayObject)._parent) {
    if (o instanceof DisplayObjectContainer) return o;
  }
  return null;
}

function isIdentityColor(ct: Readonly<ColorTransform8>): boolean {
  return ct[0] === 1 && ct[1] === 1 && ct[2] === 1 && ct[3] === 1 && ct[4] === 0 && ct[5] === 0 && ct[6] === 0 && ct[7] === 0;
}

export class Player {
  /** The Stage_Object: parent of the root, no backend node. Built before the root so root constructors can read stage. */
  readonly stage = new Stage();
  /** The root clip: a MovieClip, or a Sprite when the root symbol's class extends Sprite. */
  readonly root: Sprite;
  readonly frameIntervalMs: number;

  private readonly scene: SceneJson;
  private readonly backend: RenderBackend;
  private readonly clock: Clock;
  private readonly classRegistry: Record<string, new (...args: any[]) => Sprite>;
  private readonly maxCatchUp: number;
  private readonly scripts = new ScriptQueue();
  private readonly nodes = new NodeRegistry();
  private readonly hooks: ClipHooks;
  private readonly reportedMissing = new Set<number>();
  private readonly shapeBounds: ReadonlyMap<number, ShapeBounds>;
  private warnedSkew = false;
  /** Depth of frame-step, initial-build and cycle calls on the stack (design G7 guard). */
  private busyCount = 0;
  private readonly cycle: ClipCycle = ((player: Player): ClipCycle => ({
    get busy(): boolean {
      return player.busyCount > 0;
    },
    runGotoCycle: () => player.runGotoCycle(),
  }))(this);
  private lastNow: number;
  private accumulator = 0;

  constructor(options: PlayerOptions) {
    setCaughtErrorSink(options.onCaughtError ?? null);
    this.busyCount++;
    try {
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
        constructFrameOne: (mc) => this.constructFrameOne(mc),
      };
      this.lastNow = this.clock.now();

      const rootSymbol = this.scene.symbols[String(this.scene.rootSymbolId)];
      if (rootSymbol === undefined || rootSymbol.type !== 'sprite') {
        throw new Error(`Player: root symbol ${this.scene.rootSymbolId} is not a sprite`);
      }
      this.installScriptConstruction();
      // The root is named before frame 1 builds its children or runs any script (Requirement 8.3).
      this.root = this.createClip(this.scene.rootSymbolId, rootSymbol, 'root1');
      this.initialBuild();
      this.syncAll();
    } finally {
      this.busyCount--;
    }
  }

  /** Goto_Extra_Cycle (design G7): frameConstructed, queued frame scripts, exitFrame. No enterFrame, no advance. */
  private runGotoCycle(): void {
    this.busyCount++;
    try {
      frameConstructed(this.root);
      this.scripts.drain();
      exitFrame(this.root);
    } finally {
      this.busyCount--;
    }
  }

  /**
   * Step 0 of the Reference_Trace (design G5b, reference/output.txt lines 1 to 12): after the whole
   * tree is built, `added` + `addedToStage` per clip children first, then `frameConstructed`
   * children first, then the frame-1 scripts root first. The first two are delivered at the target
   * only, with no bubbling (eventPhase 2), because Flash has not run the ancestors' constructors yet.
   * The exitFrame pass of tick 0 is run by the Replay (decision (b), Requirement 6.3), not here.
   */
  private initialBuild(): void {
    const post = clipsPostOrder(this.root);
    const atTarget = (o: DisplayObject, type: string): void => {
      const e = new Event(type);
      e.target = o;
      e.currentTarget = o;
      o._deliver(e);
    };
    for (const clip of post) {
      atTarget(clip, Event.ADDED);
      atTarget(clip, Event.ADDED_TO_STAGE);
    }
    for (const clip of post) clip.dispatchEvent(new Event(Event.FRAME_CONSTRUCTED));
    // Only MovieClips have frame scripts; a Sprite has one frame and none.
    for (const clip of clipsPreOrder(this.root)) if (clip instanceof MovieClip) this.scripts.enqueue(clip, 1);
    this.scripts.drain();
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
    this.busyCount++;
    try {
      while (this.accumulator >= this.frameIntervalMs - EPSILON_MS && steps < this.maxCatchUp) {
        this.accumulator -= this.frameIntervalMs;
        steps++;
        this.root._step();
        exitFrame(this.root);
      }
    } finally {
      this.busyCount--;
    }
    if (this.accumulator >= this.frameIntervalMs - EPSILON_MS) {
      // Stalled for longer than the cap allows: drop the rest.
      this.accumulator %= this.frameIntervalMs;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.syncAll();
  }

  /** Last pointer position in stage coordinates; starts at (0, 0). */
  get pointer(): { x: number; y: number } {
    return { x: this.pointerX, y: this.pointerY };
  }

  /** Pointer moved: `mouseMove` at the Hit_Target when the position changed. */
  dispatchMouseMove(x: number, y: number): void {
    this.pointerEntry(x, y);
  }

  /** Button pressed: records the Pressed_Target and dispatches `mouseDown` at the Hit_Target. */
  dispatchMouseDown(x: number, y: number): void {
    const target = this.pointerEntry(x, y, false);
    if (!this.buttonDown) {
      this.buttonDown = true;
      this.pressed = target;
      target.dispatchEvent(new MouseEvent(MouseEvent.MOUSE_DOWN));
    }
    this.syncAll();
  }

  /**
   * Button released: `mouseUp` at the Hit_Target, then `click` at the Pressed_Target when it is the
   * Hit_Target. Otherwise the outcome names the release-outside pair; no event is dispatched for it.
   */
  dispatchMouseUp(x: number, y: number): PointerOutcome {
    const target = this.pointerEntry(x, y, false);
    let outcome: PointerOutcome = { releaseOutside: null };
    if (this.buttonDown) {
      const pressed = this.pressed;
      this.buttonDown = false;
      this.pressed = null;
      target.dispatchEvent(new MouseEvent(MouseEvent.MOUSE_UP));
      if (pressed === target) target.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
      else if (pressed !== null) outcome = { releaseOutside: { pressed, hit: target } };
    }
    this.syncAll();
    return outcome;
  }

  /** A click at a point: down then up. */
  dispatchClick(stageX: number, stageY: number): void {
    this.dispatchMouseDown(stageX, stageY);
    this.dispatchMouseUp(stageX, stageY);
  }

  /**
   * One hit test per entry; publishes a changed position and dispatches `mouseMove` before the entry's
   * own event. Returns the Hit_Target (the Stage_Object when no shape is hit).
   */
  private pointerEntry(x: number, y: number, sync = true): PointerTarget {
    const target = interactiveTarget(hitTest(buildHitView(this.root), x, y)?.source) ?? this.stage;
    if (x !== this.pointerX || y !== this.pointerY) {
      this.pointerX = x;
      this.pointerY = y;
      setPointerPosition(x, y);
      target.dispatchEvent(new MouseEvent(MouseEvent.MOUSE_MOVE));
    }
    if (sync) this.syncAll();
    return target;
  }

  private pointerX = 0;
  private pointerY = 0;
  private buttonDown = false;
  private pressed: PointerTarget | null = null;

  // ---- instance creation ----

  private createClip(symbolId: number, symbol: SpriteSymbol, instanceName?: string, named = instanceName !== undefined): Sprite {
    const ctx: ConstructionContext = {
      symbol,
      symbolId,
      scripts: this.scripts,
      hooks: this.hooks,
      cycle: this.cycle,
      named,
      instance: null,
    };
    // Only the root is created with an instance name; its parent is the Stage_Object, set before the constructor runs.
    if (instanceName !== undefined) ctx.rootParent = this.stage;
    let Cls: new () => Sprite = MovieClip;
    if (symbol.className !== undefined) {
      const linked = this.classRegistry[symbol.className];
      if (linked !== undefined) Cls = linked;
      else console.warn(`Player: class "${symbol.className}" is not in the registry; using MovieClip`);
    }
    // The Sprite constructor (MovieClip inherits it) registers the node and builds frame 1 (constructFrameOne), so the children are
    // created and bound before any code of `Cls` runs. Events and frame-1 scripts wait until the whole tree exists
    // (initialBuild, design G5b).
    try {
      return withConstructionContext(ctx, () => new Cls());
    } catch (thrown) {
      // A plain MovieClip has no class code to fail: a throw there is a defect of the runtime and escapes.
      if (Cls === MovieClip) throw thrown;
      const className = (symbol.className ?? Cls.name).split('.').pop() as string;
      reportCaughtError({ site: constructorSite(className), message: messageOf(thrown), className });
      // D27: the Sprite constructor set ctx.instance before the Construction_Bind, so a throw in a field initialiser
      // or in the derived body leaves the partial instance (children, timeline, scripts registered so far). A throw
      // before the base constructor completed leaves none: build the symbol again as a plain MovieClip.
      if (ctx.instance !== null) return ctx.instance;
      const fresh: ConstructionContext = { ...ctx, instance: null };
      return withConstructionContext(fresh, () => new MovieClip());
    }
  }

  /**
   * Called by the Sprite constructor (D24): registers the backend node, sets the root state for the root clip
   * (its parent is already the Stage_Object), then renders frame 1, which creates the children and exposes the named
   * ones. Nested children are created inside this call, so each child constructor ends before its parent's body.
   */
  private constructFrameOne(mc: Sprite): void {
    if (mc._parent === this.stage) {
      mc.name = ROOT_NAME;
      mc._isStageRoot = true;
      attachRoot(this.stage, mc);
    }
    this.nodes.register(mc, this.backend.createContainer());
    buildFrameOne(mc);
  }

  /**
   * D39: the map from each registered constructor to the id of the symbol whose className is its registry key, and the
   * provider for a Sprite constructor that runs with no ConstructionContext (`new Cls()` from script).
   */
  private installScriptConstruction(): void {
    const symbolOf = new Map<Function, number>();
    for (const [key, ctor] of Object.entries(this.classRegistry)) {
      for (const [id, sym] of Object.entries(this.scene.symbols)) {
        if (sym.type === 'sprite' && sym.className === key) symbolOf.set(ctor, Number(id));
      }
    }
    setContextForConstructor((newTarget) => {
      for (let c: unknown = newTarget; typeof c === 'function'; c = Object.getPrototypeOf(c)) {
        const id = symbolOf.get(c);
        if (id === undefined) continue;
        const symbol = this.scene.symbols[String(id)];
        if (symbol === undefined || symbol.type !== 'sprite') return null;
        return {
          symbol,
          symbolId: id,
          scripts: this.scripts,
          hooks: this.hooks,
          cycle: this.cycle,
          named: false,
          instance: null,
        };
      }
      return null;
    });
  }
  private createChild(entry: DisplayListEntry): DisplayObject {
    const symbol = this.scene.symbols[String(entry.symbolId)];
    if (symbol === undefined) throw new Error(`Player: unknown symbol ${entry.symbolId}`);
    if (symbol.type === 'sprite') return this.createClip(entry.symbolId, symbol, undefined, entry.name !== '');
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
