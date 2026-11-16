import { DisplayObject } from './DisplayObject';
import { Graphics } from './Graphics';
import { defaultInstanceName, defaultNamesAreSuppressed, registerClassName, takeInstanceNumber } from './internal';

export class Shape extends DisplayObject {
  get graphics(): Graphics {
    return (this._gfx ??= new Graphics());
  }

  constructor() {
    super();
    // A Shape made by script takes the next number (Requirement 28.3, not verified against Ruffle). The Player's
    // ShapeObject takes its number itself in createChild, and none when the placement has a name.
    if (!defaultNamesAreSuppressed()) this.name = defaultInstanceName(takeInstanceNumber());
  }
}

registerClassName(Shape, 'Shape');
