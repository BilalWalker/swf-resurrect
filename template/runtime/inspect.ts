/**
 * Inspection hook for Play_Tests (as3-coverage Requirement 25.4). `Player.inspect()` returns a read-only view:
 * every value is a plain copy (numbers, strings, booleans, arrays and objects of those), so changing a result
 * changes no game state. There is no setter and no reference to a display object.
 *
 *   tick              frame steps run by update() so far
 *   find(className)   every display object under the Stage_Object (root and Stage children) of that class name, in
 *                     display-list order, as a `Snapshot` (children are not expanded: `children` is []).
 *   stageChildren()   the Stage_Object's children as a tree of `Snapshot`
 *   timers()          `{ delay, running, currentCount }` per Timer; the Shim has no Timer class yet, so [].
 *
 * `className` is the registered class name (D34), or the JavaScript class name for an unregistered class.
 * `frame` and `label` are 0 and '' for an object that is not a MovieClip.
 */
import { classNameOf } from '../shim/classNames';
import type { DisplayObject } from '../shim/DisplayObject';
import { MovieClip } from '../shim/MovieClip';
import type { Stage } from '../shim/Stage';

export interface Snapshot {
  className: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  visible: boolean;
  frame: number;
  label: string;
  children: Snapshot[];
}

export interface TimerSnapshot {
  delay: number;
  running: boolean;
  currentCount: number;
}

export interface Inspection {
  readonly tick: number;
  find(className: string): Snapshot[];
  stageChildren(): Snapshot[];
  timers(): TimerSnapshot[];
}

function snapshot(o: DisplayObject, deep: boolean): Snapshot {
  const kids = deep && 'numChildren' in o ? (o as unknown as { _children: DisplayObject[] })._children : [];
  const mc = o instanceof MovieClip ? o : null;
  return {
    className: classNameOf(o),
    name: o.name,
    x: o.x,
    y: o.y,
    rotation: o.rotation,
    visible: o.visible,
    frame: mc === null ? 0 : mc.currentFrame,
    label: mc === null ? '' : ((mc.currentLabels.find((l) => l.frame === mc.currentFrame)?.name ?? '')),
    children: kids.map((c) => snapshot(c, true)),
  };
}

/** Builds the hook over the Stage_Object; `tick` is read when `inspect()` is called. */
export function inspectStage(stage: Stage, tick: number): Inspection {
  const tops = (): DisplayObject[] => stage._children as DisplayObject[];
  return {
    tick,
    find(className: string): Snapshot[] {
      const out: Snapshot[] = [];
      const walk = (o: DisplayObject): void => {
        if (classNameOf(o) === className) out.push(snapshot(o, false));
        for (const c of (o as unknown as { _children?: DisplayObject[] })._children ?? []) walk(c);
      };
      for (const t of tops()) walk(t);
      return out;
    },
    stageChildren: () => tops().map((t) => snapshot(t, true)),
    timers: () => [],
  };
}
