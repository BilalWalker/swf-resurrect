import { registerClassName } from './classNames';
import { DisplayObject } from './DisplayObject';

/**
 * The base of every display object that takes mouse input: DisplayObjectContainer and TextField. Its own module and
 * it imports only DisplayObject and classNames, so Sprite.ts and TextField.ts can extend it without a module cycle
 * (D13; the same reason as containerOps.ts).
 */
export class InteractiveObject extends DisplayObject {
  /** False makes the object ignore the pointer: it is not a Hit_Target and the hit propagates to its parent. */
  mouseEnabled = true;
}
registerClassName(InteractiveObject, 'InteractiveObject');
