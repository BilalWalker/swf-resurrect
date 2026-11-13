import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveHitTarget, type TargetNode } from '../../template/runtime/hitTest';
import { fcConfig } from './config';

// Feature: breadth, Property 53: The Hit_Target honours the mouse flags and equals the old rule by default
// **Validates: Requirements 29.2, 29.3**

const STAGE = { stage: true };

interface N extends TargetNode<typeof STAGE> {
  parent: N | typeof STAGE;
  /** Children in ascending depth; the last one is topmost. */
  kids: N[];
  /** Shapes only: the point lies inside this shape. */
  hit: boolean;
  mouseEnabled: boolean;
  mouseChildren: boolean;
  id: string;
}

interface Spec {
  container: boolean;
  enabled: boolean;
  children: boolean;
  hit: boolean;
  kids: Spec[];
}

const specArb = (flags: fc.Arbitrary<boolean>): fc.Arbitrary<Spec> =>
  fc.letrec<{ node: Spec }>((tie) => ({
    node: fc.oneof(
      { depthSize: 'small', withCrossShrink: true },
      fc.record({
        container: fc.constant(false),
        enabled: fc.constant(true),
        children: fc.constant(true),
        hit: fc.boolean(),
        kids: fc.constant([] as Spec[]),
      }),
      fc.record({
        container: fc.constant(true),
        enabled: flags,
        children: flags,
        hit: fc.constant(false),
        kids: fc.array(tie('node'), { maxLength: 4 }),
      }),
    ),
  })).node;

let counter = 0;
function build(spec: Spec, parent: N | typeof STAGE): N {
  const n: N = {
    parent,
    kids: [],
    hit: spec.hit,
    mouseEnabled: spec.enabled,
    mouseChildren: spec.children,
    isContainer: spec.container,
    id: `n${counter++}`,
  };
  n.kids = spec.kids.map((k) => build(k, n));
  return n;
}

/** The shapes under the point, topmost first: reverse depth-first order. */
function hitsOf(n: N, out: N[] = []): N[] {
  for (let i = n.kids.length - 1; i >= 0; i--) hitsOf(n.kids[i]!, out);
  if (!n.isContainer && n.hit) out.push(n);
  return out;
}

type Res = { t: 'hit'; who: N } | { t: 'prop' } | { t: 'miss' };

/**
 * Brute-force model of Ruffle's mouse_pick_avm2 and combine_with_parent, written over the real child arrays
 * (not over the hit list): all interactive children from the top, then all shapes from the top.
 */
function model(k: N, root: N): Res {
  const order = [...[...k.kids].reverse().filter((c) => c.isContainer), ...[...k.kids].reverse().filter((c) => !c.isContainer)];
  let prop = false;
  for (const c of order) {
    const res: Res = c.isContainer
      ? model(c, root)
      : c.hit
        ? k.mouseEnabled
          ? { t: 'hit', who: k }
          : { t: 'prop' }
        : { t: 'miss' };
    if (res.t === 'hit') return combine(res, k, root);
    if (res.t === 'prop') prop = true;
  }
  return prop ? combine({ t: 'prop' }, k, root) : { t: 'miss' };
}
function combine(res: Res, k: N, root: N): Res {
  if (res.t === 'hit') {
    if (k.mouseChildren && res.who !== root) return res;
    return k.mouseEnabled ? { t: 'hit', who: k } : { t: 'prop' };
  }
  if (res.t === 'prop') return k.mouseEnabled ? { t: 'hit', who: k } : { t: 'prop' };
  return res;
}
function modelTarget(root: N): N | typeof STAGE {
  const r = model(root, root);
  return r.t === 'hit' && r.who !== root ? r.who : STAGE;
}

function nodes(n: N, out: N[] = []): N[] {
  out.push(n);
  for (const k of n.kids) nodes(k, out);
  return out;
}

const anyFlags = fc.boolean();
const rootSpec = specArb(anyFlags).map((s): Spec => ({ ...s, container: true, hit: false }));

describe('Property 53: The Hit_Target honours the mouse flags and equals the old rule by default', () => {
  it('resolveHitTarget matches the model of Ruffle mouse_pick_avm2', () => {
    fc.assert(
      fc.property(rootSpec, (spec) => {
        const root = build(spec, STAGE);
        expect(resolveHitTarget(hitsOf(root), STAGE)).toBe(modelTarget(root));
      }),
      fcConfig,
    );
  });

  it('with every flag true it equals the nearest container of the topmost hit when no shape lies above an interactive sibling and the root has no shape child', () => {
    // Every container holds only containers or only shapes, and the root only containers.
    const layered: fc.Arbitrary<Spec> = fc.letrec<{ c: Spec }>((tie) => ({
      c: fc.oneof(
        { depthSize: 'small' },
        fc
          .array(fc.boolean(), { minLength: 1, maxLength: 4 })
          .map((hits): Spec => ({ container: true, enabled: true, children: true, hit: false, kids: hits.map((hit) => ({ container: false, enabled: true, children: true, hit, kids: [] })) })),
        fc.array(tie('c'), { minLength: 1, maxLength: 3 }).map((kids): Spec => ({ container: true, enabled: true, children: true, hit: false, kids })),
      ),
    })).c;
    const rooted = fc.array(layered, { minLength: 1, maxLength: 3 }).map((kids): Spec => ({ container: true, enabled: true, children: true, hit: false, kids }));
    fc.assert(
      fc.property(rooted, (spec) => {
        const root = build(spec, STAGE);
        const hits = hitsOf(root);
        const old = hits.length === 0 ? STAGE : (hits[0]!.parent as N);
        expect(resolveHitTarget(hits, STAGE)).toBe(old);
      }),
      fcConfig,
    );
  });

  it('mouseChildren = false on a container makes every hit below it resolve to it, or beyond the root to the stage', () => {
    fc.assert(
      fc.property(rootSpec, fc.nat(), (spec, pick) => {
        const root = build(spec, STAGE);
        const all = nodes(root).filter((n) => n.isContainer && n !== root);
        fc.pre(all.length > 0);
        const c = all[pick % all.length]!;
        for (const n of nodes(root)) {
          n.mouseEnabled = true;
          n.mouseChildren = true;
        }
        c.mouseChildren = false;
        const below = hitsOf(c);
        fc.pre(below.length > 0);
        // Only hits below c: the rest of the tree has no hit.
        const only = hitsOf(root).filter((h) => below.includes(h));
        // With c enabled the nearest absorbing container is the outermost mouseChildren=false one, which is c.
        expect(resolveHitTarget(only, STAGE)).toBe(c);
      }),
      fcConfig,
    );
  });

  it('a disabled object is never the target', () => {
    fc.assert(
      fc.property(rootSpec, (spec) => {
        const root = build(spec, STAGE);
        const target = resolveHitTarget(hitsOf(root), STAGE);
        if (target !== STAGE) expect((target as N).mouseEnabled).toBe(true);
      }),
      fcConfig,
    );
  });
});
