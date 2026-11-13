import { DisplayObject } from './DisplayObject';
import { registerClassName } from './internal';

export class Shape extends DisplayObject {
  readonly graphics: object = {};
}

registerClassName(Shape, 'Shape');
