import type { ButtonState } from '../runtime/buttonModel';
import type { DisplayObject } from './DisplayObject';
import { MouseEvent, type Event } from './events';
import { InteractiveObject } from './InteractiveObject';
import { registerClassName, takeButtonBuilder } from './internal';

/** The button that owns a hit-test state object. The hit state is not a child, so `_parent` cannot say it. */
const hitOwners = new WeakMap<DisplayObject, SimpleButton>();

/** The button whose hit-test state `o` is, or undefined. Read by the Player when it builds a pick path. */
export function hitOwnerOf(o: DisplayObject): SimpleButton | undefined {
  return hitOwners.get(o);
}

/**
 * flash.display.SimpleButton (robustness design D-C1, D-C5, D-C6). It holds four state display objects. The loader builds
 * each as an unparented container of the symbol's entries (`DisplayObjectContainer`). Only the current state is a child
 * (`_children` holds that one object, so the render path of every other container serves); the hit-test state is never a
 * child and is never drawn: it only adds shapes to the hit region.
 *
 * `mouseChildren` is false: a pointer event inside the button targets the button. A disabled button draws its up state
 * and takes no mouse event. Which state is current for a pointer is the Player's business (buttonModel, task 22); this
 * class holds the state it is told (`_setState`).
 */
export class SimpleButton extends InteractiveObject {
  private _enabled = true;
  /** False: the button draws its up state and dispatches no mouse event. */
  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = Boolean(v);
    this._refresh();
  }
  /** Stored only: there is no cursor. */
  useHandCursor = true;
  trackAsMenu = false;
  /** A hit inside a state targets the button, never a shape under it. */
  readonly mouseChildren = false;
  /** The render list: the current state object, or empty when that state is null. */
  _children: DisplayObject[] = [];

  private _up: DisplayObject | null = null;
  private _over: DisplayObject | null = null;
  private _down: DisplayObject | null = null;
  private _hit: DisplayObject | null = null;
  private _state: ButtonState = 'up';

  /**
   * With the Player's builder active (a button placement), the states come from the symbol. Called from script, the four
   * arguments are the states, as in AS3.
   */
  constructor(upState: DisplayObject | null = null, overState: DisplayObject | null = null, downState: DisplayObject | null = null, hitTestState: DisplayObject | null = null) {
    super();
    const build = takeButtonBuilder();
    if (build !== null) {
      build(this);
      return;
    }
    this.upState = upState;
    this.overState = overState;
    this.downState = downState;
    this.hitTestState = hitTestState;
  }

  get upState(): DisplayObject | null {
    return this._up;
  }
  set upState(v: DisplayObject | null) {
    this._up = v;
    this._refresh();
  }
  get overState(): DisplayObject | null {
    return this._over;
  }
  set overState(v: DisplayObject | null) {
    this._over = v;
    this._refresh();
  }
  get downState(): DisplayObject | null {
    return this._down;
  }
  set downState(v: DisplayObject | null) {
    this._down = v;
    this._refresh();
  }
  get hitTestState(): DisplayObject | null {
    return this._hit;
  }
  set hitTestState(v: DisplayObject | null) {
    if (this._hit !== null && hitOwners.get(this._hit) === this) hitOwners.delete(this._hit);
    this._hit = v;
    if (v !== null) hitOwners.set(v, this);
  }

  /** The state that is drawn: the state the model gave, or Up while the button is disabled (D-C6). */
  get _drawnState(): ButtonState {
    return this._enabled ? this._state : 'up';
  }

  /** Called by the Player: the state the pointer model reached. The render list follows at once. */
  _setState(state: ButtonState): void {
    this._state = state;
    this._refresh();
  }

  /** Puts the drawn state's object in the render list and takes the others out. */
  _refresh(): void {
    const s = this._drawnState;
    const want = s === 'up' ? this._up : s === 'over' ? this._over : this._down;
    if (this._children[0] === want && this._children.length === (want === null ? 0 : 1)) return;
    for (const old of this._children) if (old._parent === this) old._parent = null;
    this._children = want === null ? [] : [want];
    if (want !== null) {
      if (want._parent !== null && want._parent !== this && 'removeChild' in want._parent) want._parent.removeChild(want);
      want._parent = this;
    }
  }

  /** A disabled button takes no mouse event (Ruffle's `filter_clip_event`, read by the design). */
  override dispatchEvent(e: Event): void {
    if (!this._enabled && e instanceof MouseEvent) return;
    super.dispatchEvent(e);
  }
}
registerClassName(SimpleButton, 'SimpleButton');
