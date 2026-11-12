import { EventDispatcher } from './events';
import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectContainer } from './Sprite';

/** What a display object's parent can be: a container, or the Stage_Object for the root. */
export type ParentNode = DisplayObjectContainer | Stage;

/**
 * The Stage_Object: the parent of the root clip, not an alias of it. It carries only the
 * dispatcher members; it has no backend node and is not a DisplayObject.
 */
export class Stage extends EventDispatcher {
  readonly _isStage = true;
  readonly _parent: null = null;
  _children: DisplayObject[] = [];
}

/** True when `o` is a Stage_Object. */
export function isStage(o: unknown): o is Stage {
  return typeof o === 'object' && o !== null && (o as { _isStage?: unknown })._isStage === true;
}
