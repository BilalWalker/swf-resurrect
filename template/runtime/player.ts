import type { DisplayObject } from '../shim/DisplayObject';
import { Event, KeyboardEvent, MouseEvent } from '../shim/events';
import {
  attachRoot,
  buildFrameOne,
  clipsPostOrder,
  clipsPreOrder,
  exitFrame,
  frameConstructed,
  registerClassName,
  reportCaughtError,
  setCaughtErrorSink,
  setContextForConstructor,
  setPointerPosition,
  stepTops,
  withConstructionContext,
  defaultInstanceName,
  resetInstanceCounter,
  takeInstanceNumber,
  withoutDefaultName,
  type ClipCycle,
  type ClipHooks,
  type ConstructionContext,
} from '../shim/internal';
import { setTimeSource } from '../shim/utils';
import { InteractiveObject } from '../shim/InteractiveObject';
import { MovieClip } from '../shim/MovieClip';
import { DisplayObjectContainer, Sprite } from '../shim/Sprite';
import { isStage, Stage, type ParentNode } from '../shim/Stage';
import { TextField } from '../shim/TextField';
import { resetBroadcast } from './broadcast';
import type { NodeHandle, RenderBackend, ShapeBounds } from './backend';
import type { Clock } from './clock';
import { computeClipLayout } from './clipLayout';
import { hasOffsets, stripAlphaAdd } from './colourMatrix';
import { constructorSite, messageOf, type ErrorSink } from './errorReport';
import { hitTestAll, resolveHitTarget, type TargetNode } from './hitTest';
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

/** The grouping of one parent's children that `planClipGroups` computed. */
interface ClipPlan {
  groupOf: Map<DisplayObject, number>;
  maskOf: Map<DisplayObject, number>;
  memberCounts: number[];
  signature: string;
}

/** What `reconcileGrouped` built for one parent. */
interface GroupedLayout {
  children: DisplayObject[];
  signature: string;
  groupNodes: NodeHandle[];
  masks: DisplayObject[];
  /** A child was detached since the build; rebuild at the next reconcile. */
  stale: boolean;
}

const EPSILON_MS = 1e-9;
const DEFAULT_MAX_CATCH_UP = 5;
const ROOT_NAME = 'root1';

/**
 * A TargetNode view of a display object for `resolveHitTarget`. `parent` is the view of the parent container,
 * or the Stage_Object for the root. The flags are read live from the object.
 */
interface TargetView extends TargetNode<Stage> {
  readonly source: DisplayObjectContainer | DisplayObject;
}
function targetViewOf(o: DisplayObject, cache: Map<unknown, TargetView>): TargetView {
  const known = cache.get(o);
  if (known !== undefined) return known;
  const container = o instanceof DisplayObjectContainer ? o : null;
  const p = o._parent;
  const view: TargetView = {
    source: o,
    parent: p === null || isStage(p) ? (p as Stage | null) : targetViewOf(p as DisplayObject, cache),
    isContainer: container !== null,
    interactiveLeaf: o instanceof TextField,
    mouseEnabled: container?.mouseEnabled ?? (o instanceof InteractiveObject ? o.mouseEnabled : true),
    mouseChildren: container?.mouseChildren ?? true,
  };
  cache.set(o, view);
  return view;
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
  /** Backend container of the Stage_Object: holds the root node, then the nodes of the Stage children. */
  readonly stageNode!: NodeHandle;
  private lastNow: number;
  private accumulator = 0;

  constructor(options: PlayerOptions) {
    setCaughtErrorSink(options.onCaughtError ?? null);
    this.busyCount++;
    try {
      this.backend = options.backend;
      this.clock = options.clock;
      this.classRegistry = options.classRegistry;
      // Class names for toString come from the registry keys, never from constructor.name (D34).
      for (const [key, ctor] of Object.entries(options.classRegistry)) registerClassName(ctor, key);
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
        entryUpdated: (child, entry) => {
          this.entries.set(child, entry);
        },
        constructFrameOne: (mc) => this.constructFrameOne(mc),
      };
      this.stage.frameRate = options.scene.stage.frameRate;
      this.lastNow = this.clock.now();
      setTimeSource(() => this.clock.now());

      const rootSymbol = this.scene.symbols[String(this.scene.rootSymbolId)];
      if (rootSymbol === undefined || rootSymbol.type !== 'sprite') {
        throw new Error(`Player: root symbol ${this.scene.rootSymbolId} is not a sprite`);
      }
      this.installScriptConstruction();
      resetInstanceCounter();
      resetBroadcast();
      // The root is named before frame 1 builds its children or runs any script (Requirement 8.3).
      this.root = this.createClip(this.scene.rootSymbolId, rootSymbol, 'root1');
      this.initialBuild();
      this.stageNode = this.backend.createContainer();
      this.syncAll();
    } finally {
      this.busyCount--;
    }
  }

  /** Goto_Extra_Cycle (design G7): frameConstructed, queued frame scripts, exitFrame. No enterFrame, no advance. */
  private runGotoCycle(): void {
    this.busyCount++;
    try {
      frameConstructed();
      this.scripts.drain();
      exitFrame();
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
    frameConstructed();
    // Only MovieClips have frame scripts; a Sprite has one frame and none.
    for (const clip of clipsPreOrder(this.root)) if (clip instanceof MovieClip) this.scripts.enqueue(clip, 1);
    this.scripts.drain();
  }

  /** Backend node of the root clip alone, for the timeline-only page and tests. The adapter adds stageNode. */
  get rootNode(): NodeHandle {
    return this.nodes.nodeOf(this.root);
  }

  /** The tops of a frame step: the root, then the Stage children in index order (snapshot). */
  private tops(): Sprite[] {
    const tops: Sprite[] = [this.root];
    for (const c of this.stage._children.slice(1)) if (c instanceof Sprite) tops.push(c);
    return tops;
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
        stepTops(this.tops());
        exitFrame();
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

  /**
   * A key event (Requirement 5): a bubbling `KeyboardEvent` at `Stage.focus` when that is a display object on
   * the stage, otherwise at the Stage_Object. The one dispatch function of the browser listener, the Replay
   * runner and the Play_Tests. Each browser repeat is a further call with `KEY_DOWN`.
   */
  dispatchKey(type: typeof KeyboardEvent.KEY_DOWN | typeof KeyboardEvent.KEY_UP, keyCode: number): void {
    const focus = this.stage.focus;
    // A Stage_Object stored by the setter has no _onStage: the typeof check sends the key to the Stage.
    const onStage = focus !== null && typeof focus._onStage === 'function' && focus._onStage();
    const target = onStage ? focus : this.stage;
    target.dispatchEvent(new KeyboardEvent(type, true, false, keyCode));
    this.syncAll();
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
    const cache = new Map<unknown, TargetView>();
    // One hit view per top; the highest index is tried first and the root clip last (Requirement 7.6).
    let picked: TargetView | Stage = this.stage;
    const tops = this.tops();
    for (let i = tops.length - 1; i >= 0 && picked === this.stage; i--) {
      const hits = hitTestAll(buildHitView(tops[i]!, (o) => this.maskObjects.has(o)), x, y).map((h) => targetViewOf(h.source, cache));
      picked = resolveHitTarget(hits, this.stage, this.root === tops[i] ? targetViewOf(this.root, cache) : null);
    }
    const target = picked === this.stage ? this.stage : ((picked as TargetView).source as DisplayObjectContainer);
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
    // An unnamed shape takes the next Default_Instance_Name here (Requirement 28.2); a named one takes none.
    const shape = withoutDefaultName(() => new ShapeObject(entry.symbolId, bounds));
    if (entry.name === '') shape.name = defaultInstanceName(takeInstanceNumber());
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
  private reconcile(parent: ParentNode): void {
    const pNode = isStage(parent) ? this.stageNode : this.nodes.nodeOf(parent);
    if (pNode === undefined) return;
    const want = parent._children;
    const plan = this.planClipGroups(want);
    const grouped = this.layouts.get(parent);
    if (plan !== null) {
      this.reconcileGrouped(parent, pNode, want, plan, grouped);
      return;
    }
    if (grouped !== undefined) this.dissolveGroups(parent, pNode, grouped);
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

  // ---- clip groups (breadth design section 5, D4) ----

  /** The entry last given to each timeline child (`ClipHooks.entryUpdated`); script-added children have none. */
  private readonly entries = new WeakMap<DisplayObject, DisplayListEntry>();
  /** Parents whose children are laid out in clip groups; absent for a parent with no mask placement. */
  private readonly layouts = new WeakMap<ParentNode, GroupedLayout>();
  /** The node that holds a child's node when that is a clip group instead of the parent's node. */
  private readonly holders = new WeakMap<DisplayObject, NodeHandle>();
  /** Mask placements: not hit targets (a mask layer is not one in Flash). */
  private readonly maskObjects = new WeakSet<DisplayObject>();

  /** The clip layout of `want`, or null when no child is a mask placement. Script-added children are ungrouped. */
  private planClipGroups(want: readonly DisplayObject[]): ClipPlan | null {
    const items: Array<{ depth: number; clipDepth?: number }> = [];
    const itemChild: DisplayObject[] = [];
    let anyMask = false;
    for (const c of want) {
      const e = this.entries.get(c);
      if (e === undefined) continue;
      items.push(e.clipDepth === undefined ? { depth: e.depth } : { depth: e.depth, clipDepth: e.clipDepth });
      itemChild.push(c);
      if (e.clipDepth !== undefined) anyMask = true;
    }
    if (!anyMask) return null;
    const layout = computeClipLayout(items);
    const groupOf = new Map<DisplayObject, number>();
    const maskOf = new Map<DisplayObject, number>();
    layout.groups.forEach((g, gi) => {
      maskOf.set(itemChild[g.maskIndex]!, gi);
      for (const m of g.memberIndices) groupOf.set(itemChild[m]!, gi);
    });
    const memberCounts = layout.groups.map((g) => g.memberIndices.length);
    const signature = want.map((c) => `${groupOf.get(c) ?? -1}:${maskOf.get(c) ?? -1}`).join(',');
    return { groupOf, maskOf, memberCounts, signature };
  }

  /**
   * Lays out `want` as the parent's node children: each child in order, a mask as a plain visible sibling, and one clip
   * group per mask range at the position of its first masked child (right after the mask when the range is empty).
   * Rebuilt whole when the children or the grouping change; the mask nodes keep following their frame matrix on their own.
   */
  private reconcileGrouped(
    parent: ParentNode,
    pNode: NodeHandle,
    want: readonly DisplayObject[],
    plan: ClipPlan,
    prev: GroupedLayout | undefined,
  ): void {
    if (
      prev !== undefined &&
      !prev.stale &&
      prev.signature === plan.signature &&
      prev.children.length === want.length &&
      prev.children.every((c, i) => c === want[i])
    ) {
      return;
    }
    if (prev !== undefined) this.dissolveGroups(parent, pNode, prev);
    for (const c of this.attachedOrder.get(parent) ?? []) {
      const n = this.nodes.nodeOf(c);
      if (n !== undefined) this.backend.removeChild(pNode, n);
    }
    const groupNodes = plan.memberCounts.map(() => this.backend.createClipGroup());
    const members = plan.memberCounts.map(() => 0);
    const placed = new Set<number>();
    const masks: DisplayObject[] = [];
    const maskNodes: NodeHandle[] = [];
    let top = 0;
    for (const c of want) {
      const n = this.nodeFor(c);
      const gi = plan.groupOf.get(c);
      if (gi !== undefined) {
        if (!placed.has(gi)) {
          placed.add(gi);
          this.backend.addChildAt(pNode, groupNodes[gi]!, top++);
        }
        this.backend.addChildAt(groupNodes[gi]!, n, members[gi]!++);
        this.holders.set(c, groupNodes[gi]!);
        continue;
      }
      this.backend.addChildAt(pNode, n, top++);
      this.holders.delete(c);
      const mi = plan.maskOf.get(c);
      if (mi === undefined) continue;
      masks.push(c);
      maskNodes[mi] = n;
      this.maskObjects.add(c);
      if (plan.memberCounts[mi] === 0) this.backend.addChildAt(pNode, groupNodes[mi]!, top++);
    }
    // The masks are in the scene graph now; a mask set earlier would see a detached node.
    groupNodes.forEach((g, gi) => this.backend.setMask(g, maskNodes[gi]!));
    this.attachedOrder.set(parent, want.slice());
    this.layouts.set(parent, { children: want.slice(), signature: plan.signature, groupNodes, masks, stale: false });
  }

  /** Takes the children out of their clip groups, removes the groups and returns the parent to a flat child list. */
  private dissolveGroups(parent: ParentNode, pNode: NodeHandle, layout: GroupedLayout): void {
    for (const c of layout.children) {
      const n = this.nodes.nodeOf(c);
      const holder = this.holders.get(c);
      if (n !== undefined) this.backend.removeChild(holder ?? pNode, n);
      this.holders.delete(c);
    }
    for (const g of layout.groupNodes) {
      this.backend.setMask(g, null);
      this.backend.removeChild(pNode, g);
      this.backend.destroyNode(g);
    }
    for (const m of layout.masks) this.maskObjects.delete(m);
    this.layouts.delete(parent);
    this.attachedOrder.set(parent, []);
  }

  /** The node of `c`, created for a child added by script. */
  private nodeFor(c: DisplayObject): NodeHandle {
    let n = this.nodes.nodeOf(c);
    if (n === undefined) {
      n = this.backend.createContainer();
      this.nodes.register(c, n);
      this.backend.setTransform(n, { x: c.x, y: c.y, scaleX: c.scaleX, scaleY: c.scaleY, rotationDeg: c.rotation });
      this.backend.setAlpha(n, c.alpha);
      this.backend.setVisible(n, c.visible);
    }
    return n;
  }

  /** Reconciles node lists for the whole tree, then pushes script-changed properties. */
  private syncAll(): void {
    const walk = (o: DisplayObject | Stage): void => {
      const kids = (o as Partial<DisplayObjectContainer>)._children;
      if (kids === undefined) return;
      this.reconcile(o as ParentNode);
      for (const k of [...kids]) walk(k);
    };
    walk(this.stage);
    for (const top of this.stage._children) this.nodes.syncTree(this.backend, top);
  }

  private readonly attachedOrder = new WeakMap<ParentNode, DisplayObject[]>();

  /** Destroys the child's node; the backend releases the subtree below it with it. */
  private detach(parent: DisplayObjectContainer, child: DisplayObject): void {
    const p = this.nodes.nodeOf(parent);
    const c = this.nodes.nodeOf(child);
    const order = this.attachedOrder.get(parent);
    if (order !== undefined) this.attachedOrder.set(parent, order.filter((o) => o !== child));
    const layout = this.layouts.get(parent);
    if (layout !== undefined) {
      layout.children = layout.children.filter((o) => o !== child);
      layout.stale = true;
    }
    this.maskObjects.delete(child);
    if (c === undefined) return;
    const holder = this.holders.get(child);
    this.holders.delete(child);
    if (p !== undefined) this.backend.removeChild(holder ?? p, c);
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
    // Identity on a fresh node needs no call; a change back to identity is an explicit call from a later entry.
    if (isIdentityColor(ct) && !this.coloured.has(child)) return;
    this.coloured.add(child);
    if (hasOffsets(ct)) {
      // The alpha add term is stripped so the filter does not paint the box around the glyphs (design section 4, F16).
      this.backend.setColorOffset(node, stripAlphaAdd(ct));
      this.offsetFiltered.add(child);
      return;
    }
    if (this.offsetFiltered.delete(child)) this.backend.setColorOffset(node, null);
    this.backend.setColorMultiplier(node, ct[0], ct[1], ct[2], ct[3]);
  }

  private readonly coloured = new WeakSet<DisplayObject>();
  private readonly offsetFiltered = new WeakSet<DisplayObject>();

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
      this.backend.showError(`Shape asset ${target.file} is not loaded; entries using it are skipped`);
    }
    return false;
  }
}
