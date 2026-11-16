import type { Event, EventDispatcher } from '../shim/events';

/**
 * Broadcast_Events: `enterFrame`, `frameConstructed` and `exitFrame` go to every display object and to the Stage_Object
 * that has a listener, in the order in which the objects first registered one for that type, whether or not the object
 * is on the display list. Read in the Ruffle_Source (`core/src/avm2.rs` `register_broadcast_listener` and
 * `broadcast_event`; as3-coverage Requirement 7.9, design finding F4).
 *
 * The lists are module state, like the pointer position: one movie per page. The Player resets them when it is built.
 * This file imports types only, so `shim/events.ts` can register without a module cycle.
 */
export const BROADCAST_TYPES: readonly string[] = ['enterFrame', 'frameConstructed', 'exitFrame'];

const lists = new Map<string, EventDispatcher[]>();

/** Empties the lists. Called by the Player constructor. */
export function resetBroadcast(): void {
  lists.clear();
}

/** Only display objects (they have `_onStage`) and the Stage_Object take part (Ruffle `on_type`). */
function takesPart(o: EventDispatcher): boolean {
  const x = o as { _isStage?: unknown; _onStage?: unknown };
  return x._isStage === true || typeof x._onStage === 'function';
}

/** Called by `addEventListener`: records `o` at the end of the list of `type` on its first registration. */
export function registerBroadcastListener(o: EventDispatcher, type: string): void {
  if (!BROADCAST_TYPES.includes(type) || !takesPart(o)) return;
  let list = lists.get(type);
  if (list === undefined) lists.set(type, (list = []));
  if (!list.includes(o)) list.push(o);
}

/** The registered objects of `type`, in registration order (a copy). */
export function broadcastRecipients(type: string): EventDispatcher[] {
  return (lists.get(type) ?? []).slice();
}

/**
 * Delivers one event of `type` to each registered object once, in registration order. An object that no longer has a
 * listener for the type is dropped from the list and skipped; one that registers again later goes to the end
 * (as3-coverage Open_Item O3). Objects that register during the delivery receive the next one.
 */
export function broadcast(type: string, create: () => Event): void {
  const list = lists.get(type);
  if (list === undefined) return;
  for (const o of list.slice()) {
    if (!o.hasEventListener(type)) {
      const i = list.indexOf(o);
      if (i >= 0) list.splice(i, 1);
      continue;
    }
    o.dispatchEvent(create());
  }
}
