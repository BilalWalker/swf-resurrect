import { describe, expect, it } from 'vitest';
import { exportedNames } from '../../src/emit/exportedNames';
import { as3InterfaceName } from '../../src/translate/interfaceDecl';

const names = (text: string): string[] | null => {
  const r = exportedNames(text);
  return r === null ? null : [...r].sort();
};

describe('exportedNames', () => {
  it('reads declarations, lists and renames at the top level only', () => {
    const text = [
      "import { X } from './X';",
      'export class A { static b = 1; export2 = 2; }',
      'export abstract class B {}',
      'export function f() { const export3 = 1; }',
      'export const c = 1, d = 2;',
      'export interface I {}',
      "export { x as y, z } from './m';",
      'export default class {}',
    ].join('\n');
    expect(names(text)).toEqual(['A', 'B', 'I', 'c', 'default', 'f', 'y', 'z']);
  });

  it('gives an empty set for a comment-only file', () => {
    expect(names('// AS3: public interface IFocusManager\n// AS3: {\n')).toEqual([]);
  });

  it('gives null when the names cannot be told', () => {
    expect(names("export * from './m';")).toBeNull();
    expect(names('export const { a } = o;')).toBeNull();
  });
});

describe('as3InterfaceName', () => {
  it('finds a package-level interface and ignores comments and class bodies', () => {
    expect(as3InterfaceName('package a.b {\n  public interface IThing extends IOther {\n  }\n}')).toBe('IThing');
    expect(as3InterfaceName('package a {\n  // interface Nope\n  public class C { var interface2:int; }\n}')).toBeNull();
  });
});
