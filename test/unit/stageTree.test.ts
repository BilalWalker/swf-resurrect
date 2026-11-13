// describeTarget names pointer targets for reports (breadth task 7.5).
// Validates: Requirements 14.20

import { describe, expect, it } from 'vitest';
import { MovieClip } from '../../template/shim/MovieClip';
import { Stage } from '../../template/shim/Stage';
import { attachRoot } from '../../template/shim/internal';
import { describeTarget } from '../../template/runtime/stageTree';

describe('describeTarget', () => {
  it('names the Stage_Object `stage`', () => {
    expect(describeTarget(new Stage())).toBe('stage');
  });

  it('joins the name chain from the root down', () => {
    const stage = new Stage();
    const root = new MovieClip();
    root.name = 'root1';
    attachRoot(stage, root);
    const beetle = new MovieClip();
    beetle.name = 'beetle';
    root.addChild(beetle);
    expect(describeTarget(root)).toBe('root1');
    expect(describeTarget(beetle)).toBe('root1.beetle');
  });

  it('uses #<child index> for an empty name', () => {
    const stage = new Stage();
    const root = new MovieClip();
    root.name = 'root1';
    attachRoot(stage, root);
    const a = new MovieClip();
    const b = new MovieClip();
    a.name = '';
    b.name = ''; // a script-created clip has a Default_Instance_Name (Requirement 28.3); an empty name needs this reset
    root.addChild(a);
    root.addChild(b);
    expect(describeTarget(b)).toBe('root1.#1');
  });
});
