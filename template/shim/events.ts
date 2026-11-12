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
    this.bubbles = bubbles ?? (type === 'added' || type === 'removed' || type === 'click');
    this.cancelable = cancelable;
    this.eventPhase = eventPhase;
  }

  toString(): string {
    return `[Event type="${this.type}" bubbles=${this.bubbles} cancelable=${this.cancelable} eventPhase=${this.eventPhase}]`;
  }
}

export class MouseEvent extends Event {
  static readonly CLICK = 'click';
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
    for (const listener of snapshot) listener(e);
  }
}
