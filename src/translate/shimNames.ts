/**
 * Names the Emitted_Project Shim provides. Pure data: this file must not
 * import from the Shim. A unit test checks the lists against the Shim.
 */

/** AS3 names exported by the Shim; imported from '../shim' in translated code. */
export const SHIM_AS3_NAMES: ReadonlySet<string> = new Set([
  'Event',
  'EventDispatcher',
  'MouseEvent',
  'DisplayObject',
  'DisplayObjectContainer',
  'Sprite',
  'MovieClip',
  'Shape',
  'trace',
]);

/** Members of MovieClip; a bare call to one of these becomes `this.<name>(`. */
export const SHIM_MOVIECLIP_MEMBERS: ReadonlySet<string> = new Set([
  'play',
  'stop',
  'gotoAndPlay',
  'gotoAndStop',
  'addFrameScript',
  'addEventListener',
  'removeEventListener',
  'hasEventListener',
  'dispatchEvent',
  'addChild',
  'removeChild',
  'getChildByName',
  'getChildAt',
]);
