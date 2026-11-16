import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson } from '../../template/runtime/scene';
import { FakeBackend } from '../support/fakeBackend';
import { fcConfig } from './config';

function playerAt(frameRate: number): Player {
  const scene: SceneJson = {
    formatVersion: 2,
    stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate },
    rootSymbolId: 0,
    symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [] } },
  };
  return new Player({ scene, backend: new FakeBackend(), clock: new ManualClock(), classRegistry: {}, shapeBounds: new Map() });
}

// Feature: as3-coverage, Property 9: frameRate comes from the scene
/** **Validates: Requirements 8.2, 8.7** */
describe('Property 9: frameRate comes from the scene', () => {
  it('equals the scene frame rate for any positive rate', () => {
    fc.assert(fc.property(fc.double({ min: 0.01, max: 1000, noNaN: true }), (rate) => playerAt(rate).stage.frameRate === rate), fcConfig);
  });
  it.each([30, 60])('is %i for a scene at %i', (rate) => {
    expect(playerAt(rate).stage.frameRate).toBe(rate);
  });
});
