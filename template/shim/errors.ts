// AS3 error classes. Subclasses of Error whose name is the class name.
export class ArgumentError extends Error {
  constructor(message = '', readonly errorID = 0) {
    super(message);
    this.name = 'ArgumentError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class IllegalOperationError extends Error {
  constructor(message = '', readonly errorID = 0) {
    super(message);
    this.name = 'IllegalOperationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
