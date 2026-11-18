// The button state model: a pure table and the hit region (design D-C2, D-C3). No node module, clock or randomness.
// The Player calls these; it holds no button logic of its own.
import { multiply, type Affine } from './affine';

/** The three drawn states. The hit container is never a state: it is only part of the hit region. */
export type ButtonState = 'up' | 'over' | 'down';

/** Ruffle's `ButtonEvent`s that change the state (`avm2_button.rs`). */
export type ButtonEvent = 'rollOver' | 'rollOut' | 'press' | 'release' | 'releaseOutside' | 'mouseUpInside' | 'dragOut' | 'dragOver';

const TABLE: Readonly<Record<ButtonEvent, ButtonState>> = {
  rollOver: 'over',
  rollOut: 'up',
  press: 'down',
  release: 'over',
  releaseOutside: 'up',
  mouseUpInside: 'up',
  dragOut: 'over',
  dragOver: 'down',
};

/** The state after an event. Each event has one target state whatever the old state is, as in Ruffle's table. */
export function step(_state: ButtonState, event: ButtonEvent): ButtonState {
  return TABLE[event];
}

/** One shape of a state container: the shape and its matrix into the container's space. */
export interface RegionShape<S> {
  shape: S;
  matrix: Affine;
}

/** The shapes of each state container of a button, and the button's placement matrix into its parent. */
export interface ButtonShapes<S> {
  placement: Affine;
  states: { up: readonly RegionShape<S>[]; over: readonly RegionShape<S>[]; down: readonly RegionShape<S>[]; hit: readonly RegionShape<S>[] };
}

/**
 * The hit region in the parent's space: the shapes of the current state container, then those of the hit container,
 * each with the placement matrix applied. With no hit records the hit container is empty, so the current state's shapes
 * alone serve (Requirement 20.8). A shape that only a non-current state holds is not in the region.
 */
export function hitRegion<S>(button: ButtonShapes<S>, state: ButtonState): RegionShape<S>[] {
  return [...button.states[state], ...button.states.hit].map((r) => ({ shape: r.shape, matrix: multiply(button.placement, r.matrix) }));
}
