// Robustness task 16.2, Requirement 17.9: classes whose type check depends on a Flash_API_Table stub.
import { describe, expect, it } from 'vitest';
import { stubClasses } from '../../src/translate/flashApiTable';
import { countStubDependents, limitCanStall, stubSimpleNames, stubsUsedBy } from '../../src/translate/stubDependents';
import type { ImportRecord } from '../../src/translate/types';

const shim = (...names: string[]): ImportRecord => ({ line: 1, kind: 'shim', names: names.map((name) => ({ name })) });
const cls = (target: string): ImportRecord => ({ line: 2, kind: 'class', target, names: [{ name: 'Sound' }] });

describe('stub dependents', () => {
  it('knows the simple names of every stub entry', () => {
    const names = stubSimpleNames();
    for (const q of stubClasses()) expect(names.has(q.slice(q.lastIndexOf('.') + 1))).toBe(true);
    expect(names.has('Sound')).toBe(true);
    expect(names.has('Point')).toBe(false); // real, not a stub
  });

  it('counts a class once however many stubs it imports, and only from the Shim line', () => {
    const classes = [
      { importRecords: [shim('Sprite', 'Sound', 'SoundChannel')] },
      { importRecords: [shim('Sprite', 'Point')] },
      { importRecords: [shim('Sprite'), cls('a.Sound')] }, // a project class named Sound is not the stub
      { importRecords: [shim('URLLoader')] },
      { importRecords: [] },
    ];
    expect(countStubDependents(classes)).toBe(2);
    expect(stubsUsedBy(classes[0]!.importRecords)).toEqual(['Sound', 'SoundChannel']);
  });

  it('is zero for no classes', () => {
    expect(countStubDependents([])).toBe(0);
  });

  it('reads canStall from the table by the limit id', () => {
    expect(limitCanStall('api-stub:Sound.play')).toBe(true);
    expect(limitCanStall('api-stub-no-event:Loader')).toBe(true);
    expect(limitCanStall('api-stub:SharedObject.getLocal')).toBe(false);
    expect(limitCanStall('api-stub:navigateToURL')).toBe(false);
    expect(limitCanStall('useCapture-ignored')).toBe(false);
  });
});
