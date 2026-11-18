import { registerBroadcastListener } from '../runtime/broadcast';
import { listenerSite, messageOf } from '../runtime/errorReport';
import { namedLimit, reportCaughtError } from './errorSink';

/**
 * A listener. Declared as a method signature so that a parameter is compared bivariantly: AS3 lets a listener take any
 * Event subclass ((e: MouseEvent) => void), and MouseEvent and KeyboardEvent have members that Event lacks.
 */
export type Listener = { bivarianceHack(e: Event): void }['bivarianceHack'];

export class Event {
  static readonly ENTER_FRAME = 'enterFrame';
  static readonly EXIT_FRAME = 'exitFrame';
  static readonly ADDED = 'added';
  static readonly ADDED_TO_STAGE = 'addedToStage';
  static readonly FRAME_CONSTRUCTED = 'frameConstructed';
  static readonly REMOVED = 'removed';
  static readonly REMOVED_FROM_STAGE = 'removedFromStage';
  static readonly RENDER = 'render';
  target: EventDispatcher | null = null;
  currentTarget: EventDispatcher | null = null;
  bubbles: boolean;
  cancelable: boolean;
  eventPhase: number;

  constructor(
    readonly type: string,
    bubbles?: boolean,
    cancelable = false,
    eventPhase = 2,
  ) {
    this.bubbles = bubbles ?? (type === 'added' || type === 'removed' ||
      type === 'click' ||
      type === 'mouseDown' ||
      type === 'mouseUp' ||
      type === 'mouseMove' ||
      type === 'mouseOver' ||
      type === 'mouseOut');
    this.cancelable = cancelable;
    this.eventPhase = eventPhase;
  }

  /** Instance method, as in Ruffle's Event.as: a new Event with the same type, bubbles and cancelable. */
  clone(): Event {
    return new Event(this.type, this.bubbles, this.cancelable);
  }
  toString(): string {
    return this.formatToString('Event', 'type', 'bubbles', 'cancelable', 'eventPhase');
  }
  /**
   * Instance method, as in Flash and Ruffle's Event.as: `[ClassName k=v ...]`, each value read from `this[key]`,
   * a string quoted, anything else concatenated.
   */
  formatToString(className: string, ...properties: string[]): string {
    let out = `[${className}`;
    for (const key of properties) {
      const value = (this as unknown as Record<string, unknown>)[key];
      out += typeof value === 'string' ? ` ${key}="${value}"` : ` ${key}=${String(value)}`;
    }
    return `${out}]`;
  }
}

export class MouseEvent extends Event {
  static readonly CLICK = 'click';
  static readonly MOUSE_DOWN = 'mouseDown';
  static readonly MOUSE_UP = 'mouseUp';
  static readonly MOUSE_MOVE = 'mouseMove';
  static readonly MOUSE_WHEEL = 'mouseWheel';
  /** `mouseOver` and `mouseOut` bubble; `rollOver` and `rollOut` do not (Ruffle `interactive.rs`, read). */
  static readonly MOUSE_OVER = 'mouseOver';
  static readonly MOUSE_OUT = 'mouseOut';
  static readonly ROLL_OVER = 'rollOver';
  static readonly ROLL_OUT = 'rollOut';
  /** Lines scrolled by a wheel event; 0 for every other type. The Player does not dispatch the wheel (Named_Limit). */
  delta = 0;
}

/** Key events bubble by default, as in Flash (Requirement 4.1). `keyCode` is a Flash key code (see `Keyboard`). */
export class KeyboardEvent extends Event {
  static readonly KEY_DOWN = 'keyDown';
  static readonly KEY_UP = 'keyUp';

  keyCode: number;

  constructor(type: string, bubbles = true, cancelable = false, keyCode = 0) {
    super(type, bubbles, cancelable);
    this.keyCode = keyCode;
  }

  override clone(): Event {
    return new KeyboardEvent(this.type, this.bubbles, this.cancelable, this.keyCode);
  }
}

interface Registration {
  readonly listener: Listener;
  readonly priority: number;
}

export class EventDispatcher {
  /** Per type, sorted by descending priority and, inside one priority, by insertion order (Ruffle DispatchList). */
  private readonly listeners = new Map<string, Registration[]>();

  /**
   * Registers once per (type, listener) at any priority: a listener already present is ignored, as in Ruffle
   * `events.rs` `add_event_listener`. `useCapture` and `useWeakReference` are ignored (Named_Limits).
   */
  addEventListener(type: string, listener: Listener, useCapture = false, priority = 0, useWeakReference = false): void {
    if (useCapture) namedLimit('useCapture-ignored', type);
    if (useWeakReference) namedLimit('useWeakReference-ignored', `addEventListener('${type}') useWeakReference is ignored: listeners are held strongly`);
    if (type === MouseEvent.MOUSE_WHEEL) namedLimit('mouse-wheel-not-dispatched', 'the Player does not dispatch mouseWheel; the listener is registered and never called');
    registerBroadcastListener(this, type);
    const entry: Registration = { listener, priority: Math.trunc(priority) };
    const list = this.listeners.get(type);
    if (list === undefined) {
      this.listeners.set(type, [entry]);
      return;
    }
    if (list.some((r) => r.listener === listener)) return;
    // Insert after the last entry whose priority is >= the new one. A new array keeps earlier snapshots intact.
    let at = list.length;
    while (at > 0 && list[at - 1]!.priority < entry.priority) at--;
    const next = list.slice();
    next.splice(at, 0, entry);
    this.listeners.set(type, next);
  }
  /** Takes effect from the next dispatch; a dispatch in progress works on a snapshot. */
  removeEventListener(type: string, listener: Listener, _useCapture = false): void {
    const list = this.listeners.get(type);
    if (list === undefined) return;
    const i = list.findIndex((r) => r.listener === listener);
    if (i < 0) return;
    // Replace rather than splice so a snapshot taken earlier is never mutated.
    const next = list.slice();
    next.splice(i, 1);
    if (next.length === 0) this.listeners.delete(type);
    else this.listeners.set(type, next);
  }

  hasEventListener(type: string): boolean {
    return (this.listeners.get(type)?.length ?? 0) > 0;
  }

  /** Calls every listener in the snapshot taken at the start, in priority order. */
  dispatchEvent(e: Event): void {
    e.target = this;
    e.currentTarget = this;
    this._deliver(e);
  }
  /** Internal: calls this object's listeners for the event without touching target, currentTarget or eventPhase. */
  _deliver(e: Event): void {
    const snapshot = this.listeners.get(e.type)?.map((r) => r.listener);
    if (snapshot === undefined) return;
    // A throwing listener is abandoned alone (Requirement 25.2): report it and call the next one.
    for (const listener of snapshot) {
      try {
        listener(e);
      } catch (thrown) {
        reportCaughtError({
          site: listenerSite(e.type, this._describe()),
          message: messageOf(thrown),
          className: null,
        });
      }
    }
  }
  /** Internal: the target description of a listener Error_Site: the instance name when there is one, else the class. */
  _describe(): string {
    const name = (this as { name?: unknown }).name;
    return typeof name === 'string' && name !== '' ? name : this.constructor.name;
  }
}
