import { listenerSite, messageOf } from '../runtime/errorReport';
import { reportCaughtError } from './errorSink';

export type Listener = (e: Event) => void;

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
      type === 'mouseMove');
    this.cancelable = cancelable;
    this.eventPhase = eventPhase;
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
}

export class EventDispatcher {
  private readonly listeners = new Map<string, Listener[]>();

  /** Registers once per (type, listener); registration order is preserved. */
  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type);
    if (list === undefined) {
      this.listeners.set(type, [listener]);
    } else if (!list.includes(listener)) {
      list.push(listener);
    }
  }

  /** Takes effect from the next dispatch; a dispatch in progress works on a snapshot. */
  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type);
    if (list === undefined) return;
    const i = list.indexOf(listener);
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

  /** Calls every listener in the snapshot taken at the start, in registration order. */
  dispatchEvent(e: Event): void {
    e.target = this;
    e.currentTarget = this;
    this._deliver(e);
  }
  /** Internal: calls this object's listeners for the event without touching target, currentTarget or eventPhase. */
  _deliver(e: Event): void {
    const snapshot = this.listeners.get(e.type)?.slice();
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
