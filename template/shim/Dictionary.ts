// Dictionary: a map that keys by identity for objects and functions and by value for strings and numbers
// (as3-coverage D10, Requirement 13). Built on Map, whose SameValueZero comparison does exactly that.
// The translator rewrites `d[k]`, `d[k] = v`, `k in d` and `delete d[k]` on a receiver typed Dictionary to
// get, set, has and delete; a JS Proxy cannot do it because `d[fn]` stringifies `fn` before any trap runs.
import { namedLimit } from './errorSink';

export class Dictionary {
  private readonly _map = new Map<any, any>();

  /** `weakKeys` is accepted and ignored: keys are held strongly (Named_Limit `dictionary-weakKeys-ignored`). */
  constructor(weakKeys = false) {
    if (weakKeys) namedLimit('dictionary-weakKeys-ignored', 'new Dictionary(true): keys are held strongly');
  }

  get(key: any): any {
    return this._map.get(key);
  }

  /** Returns the value, so that an assignment used as an expression keeps its AS3 meaning. */
  set(key: any, value: any): any {
    this._map.set(key, value);
    return value;
  }

  has(key: any): boolean {
    return this._map.has(key);
  }

  delete(key: any): boolean {
    return this._map.delete(key);
  }
}
