import { describe, expect, it } from 'vitest';
import { ArgumentError, IllegalOperationError, getQualifiedClassName } from '../../template/shim';
import { registerClassName } from '../../template/shim/internal';

describe('error classes', () => {
  it('are Errors whose name equals the class name', () => {
    const a = new ArgumentError('bad');
    const i = new IllegalOperationError('no');
    expect(a).toBeInstanceOf(Error);
    expect(a).toBeInstanceOf(ArgumentError);
    expect(a.name).toBe('ArgumentError');
    expect(a.message).toBe('bad');
    expect(i.name).toBe('IllegalOperationError');
    expect(i).toBeInstanceOf(Error);
  });
});

describe('getQualifiedClassName', () => {
  it('uses the registered name for an instance and the class', () => {
    class Mangled {}
    registerClassName(Mangled, 'pkg.Hero');
    expect(getQualifiedClassName(new Mangled())).toBe('Hero');
    expect(getQualifiedClassName(Mangled)).toBe('Hero');
  });
  it('returns the function name for an unregistered class', () => {
    class Plain {}
    expect(getQualifiedClassName(Plain)).toBe('Plain');
    expect(getQualifiedClassName(new Plain())).toBe('Plain');
  });
});
