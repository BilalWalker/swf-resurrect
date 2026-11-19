import { describe, expect, it } from 'vitest';
import { groupTypeErrors, topGroups, typeErrorKey } from '../../src/translate/typeErrorGroups';
describe('typeErrorKey', () => {
  it('groups a missing name by the name, whatever the code variant', () => {
    expect(typeErrorKey(2304, "Cannot find name 'Foo'.").key).toBe('TS2304 name Foo');
    expect(typeErrorKey(2552, "Cannot find name 'Foo'. Did you mean 'Fob'?").key).toBe('TS2304 name Foo');
    expect(typeErrorKey(2663, "Cannot find name 'Foo'. Did you mean the instance member 'this.Foo'?").kind).toBe('name-not-found');
  });
  it('groups a missing member by owner type and member', () => {
    expect(typeErrorKey(2339, "Property 'draw' does not exist on type 'Screen'.")).toEqual({ key: 'TS2339 Screen.draw', kind: 'member-missing' });
    expect(typeErrorKey(2551, "Property 'draw' does not exist on type 'Screen'. Did you mean 'drag'?").key).toBe('TS2339 Screen.draw');
  });
  it('groups an assignment error by target type and reason', () => {
    const m = "Argument of type 'A' is not assignable to parameter of type 'B'.\n  Property '_r' is private in type 'B' but not in type 'A'.";
    expect(typeErrorKey(2345, m).key).toBe('TS2345 to B (private member _r)');
    expect(typeErrorKey(2345, "Argument of type 'A' is not assignable to parameter of type 'B'.\n  Type 'A' is missing the following properties from type 'B': x, y").key).toBe('TS2345 to B (missing members)');
  });
  it('replaces quoted names in any other message and ignores the path of a non-module file', () => {
    expect(typeErrorKey(2306, "File '<out>/src/a.ts' is not a module.").key).toBe('TS2306 file is not a module');
    expect(typeErrorKey(9999, "Odd 'x' and 'y'").key).toBe("TS9999 Odd '#' and '#'");
  });
});
describe('groupTypeErrors', () => {
  const e = (code: number, name: string) => ({ code, message: "Cannot find name '" + name + "'." });
  it('counts per file, sorts by total then key, and cuts the top n', () => {
    const groups = groupTypeErrors([
      { file: 'one', errors: [e(2304, 'B'), e(2304, 'A'), e(2304, 'A')] },
      { file: 'two', errors: [e(2304, 'B'), e(2304, 'C')] },
    ]);
    expect(groups.map((g) => [g.key, g.total, g.perFile])).toEqual([
      ['TS2304 name A', 2, { one: 2, two: 0 }],
      ['TS2304 name B', 2, { one: 1, two: 1 }],
      ['TS2304 name C', 1, { one: 0, two: 1 }],
    ]);
    expect(topGroups(groups, 2)).toHaveLength(2);
    expect(topGroups(groups, 0)).toEqual([]);
  });
  it('gives the same groups for the same input', () => {
    const files = [{ file: 'f', errors: [e(2304, 'Z'), e(2304, 'Y')] }];
    expect(groupTypeErrors(files)).toEqual(groupTypeErrors(files));
  });
});