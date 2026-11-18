// Public Flash API surface. The internal module is deliberately not exported here.
export { Event, EventDispatcher, KeyboardEvent, MouseEvent } from './events';
export { Keyboard } from './Keyboard';
export type { Listener } from './events';
export { DisplayObject } from './DisplayObject';
export { InteractiveObject } from './InteractiveObject';
export { TextField } from './TextField';
export { GlowFilter } from './GlowFilter';
export { DisplayObjectContainer, Sprite } from './Sprite';
export { Stage } from './Stage';
export { StageScaleMode } from './StageScaleMode';
export { MovieClip } from './MovieClip';
export { Dictionary } from './Dictionary';
export { Shape } from './Shape';
export { Rectangle } from './Rectangle';
export { Point } from './Point';
export { trace, setTraceSink } from './trace';
export { getDefinitionByName, getQualifiedClassName, getTimer, isInstanceOf, registerDefinitions } from './utils';
export { ArgumentError, IllegalOperationError } from './errors';
export { defineInterface, declareImplements } from './interfaces';
export type { AS3InterfaceToken } from './interfaces';
export { Graphics, GraphicsPathWinding } from './Graphics';

export { Timer, TimerEvent } from './Timer';

// Generated API stubs (npm run gen:api-stubs, from src/translate/flashApiTable.ts). They ship in every project.
export { ExternalInterface } from './stubs/ExternalInterface';
export { LocalConnection } from './stubs/LocalConnection';
export { Loader } from './stubs/Loader';
export { LoaderInfo } from './stubs/LoaderInfo';
export { navigateToURL } from './stubs/navigateToURL';
export { Security } from './stubs/Security';
export { SharedObject } from './stubs/SharedObject';
export { Sound } from './stubs/Sound';
export { SoundChannel } from './stubs/SoundChannel';
export { SoundMixer } from './stubs/SoundMixer';
export { SoundTransform } from './stubs/SoundTransform';
export { URLLoader } from './stubs/URLLoader';
export { URLRequest } from './stubs/URLRequest';
export { URLVariables } from './stubs/URLVariables';
