import { addChildTo, getChildAtOf, getChildByNameOf, removeChildFrom } from './containerOps';
import type { DisplayObject } from './DisplayObject';
import type { InteractiveObject } from './InteractiveObject';
import { ArgumentError, IllegalOperationError } from './errors';
import { EventDispatcher } from './events';
import { classNameOf, registerClassName } from './classNames';
import { namedLimit } from './errorSink';
import { getPointerPosition } from './pointerState';
import type { DisplayObjectContainer } from './Sprite';
import { StageScaleMode } from './StageScaleMode';
/** What a display object's parent can be: a container, or the Stage_Object for the root. */
export type ParentNode = DisplayObjectContainer | Stage;
/**
 * The Stage_Object: the top of the display tree. It is not a DisplayObject (no transform, no name, no backend node) but
 * it holds children: `_children[0]` is the root clip, and children added by script follow it in draw order. The
 * container methods are the shared functions of containerOps.ts.
 */
export class Stage extends EventDispatcher {
  readonly _isStage = true;
  readonly _parent: null = null;
  _children: DisplayObject[] = [];
  private _focus: InteractiveObject | Stage | null = null;
  /**
   * The object that receives key events; null sends them to the Stage. Read as InteractiveObject | null, as in AS3, so
   * ar io:InteractiveObject = stage.focus type-checks. In AS3 the Stage is itself an InteractiveObject and stage.focus =
   * stage is legal (entity_game), but here it is not a DisplayObject, so the setter accepts it and the getter hands it
   * back typed as InteractiveObject (it has no _onStage; Player.dispatchKey treats it as the Stage).
   */
  get focus(): InteractiveObject | null {
    return this._focus as InteractiveObject | null;
  }
  set focus(v: InteractiveObject | Stage | null) {
    this._focus = v;
  }
  /** Frames per second of the movie. The Player sets it from Scene_JSON `stage.frameRate`. */
  frameRate = 0;
  private _scaleMode: string = StageScaleMode.SHOW_ALL;
  /** Stored only; it has no effect on drawing (Named_Limit `stage-scaleMode`). */
  get scaleMode(): string {
    return this._scaleMode;
  }
  set scaleMode(v: string) {
    this._scaleMode = v;
    namedLimit('stage-scaleMode', 'Stage.scaleMode is stored and has no effect on drawing');
  }
  /** Pointer x in stage coordinates: the last position the Player received. */
  get mouseX(): number {
    return getPointerPosition().x;
  }
  /** Pointer y in stage coordinates. */
  get mouseY(): number {
    return getPointerPosition().y;
  }
  get numChildren(): number {
    return this._children.length;
  }
  /** Appends above the other children. The root clip cannot be added again: it stays at index 0. */
  addChild<T extends DisplayObject>(child: T): T {
    if (child === this._children[0]) throw new ArgumentError('addChild: the root clip is already the first child of the Stage');
    if ((child as { _isTextField?: unknown })._isTextField === true) {
      namedLimit('textfield-on-stage-not-hit', 'a TextField that is a direct child of the Stage is not hit-tested');
    }
    return addChildTo(this, child);
  }
  /** A non-child throws `ArgumentError` and leaves the list unchanged. The root clip cannot be removed. */
  removeChild<T extends DisplayObject>(child: T): T {
    if (child === this._children[0] && child._parent === this) {
      throw new IllegalOperationError('removeChild: the root clip cannot be removed from the Stage');
    }
    return removeChildFrom(this, child, () => new ArgumentError('removeChild: the object is not a child of the Stage'));
  }
  getChildAt(index: number): DisplayObject {
    return getChildAtOf(this, index);
  }
  getChildByName(name: string): DisplayObject | null {
    return getChildByNameOf(this, name);
  }
  /** `[object Stage]` from the class-name registration (Requirement 28.1). */
  toString(): string {
    return `[object ${classNameOf(this)}]`;
  }
}
registerClassName(Stage, 'Stage');
/** True when `o` is a Stage_Object. */
export function isStage(o: unknown): o is Stage {
  return typeof o === 'object' && o !== null && (o as { _isStage?: unknown })._isStage === true;
}
