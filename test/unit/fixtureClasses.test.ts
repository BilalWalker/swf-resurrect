import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MovieClip } from '../../template/shim/MovieClip';
import { loadFixtureClasses, type FixtureClasses } from '../support/fixtureClasses';

describe('loadFixtureClasses (design 9, risk R2)', () => {
  let fx: FixtureClasses;
  beforeAll(async () => {
    fx = await loadFixtureClasses('clickgoto');
  });
  afterAll(async () => {
    await fx?.dispose();
  });

  it('imports translated classes from .work/ and they extend the Shim MovieClip', () => {
    expect(Object.keys(fx.classes).sort()).toEqual(['LeftButton', 'MainTimeline', 'RightButton']);
    for (const C of Object.values(fx.classes)) expect(new C()).toBeInstanceOf(MovieClip);
    expect([...fx.results.keys()]).toContain('EventWatcher');
  });

  it('dispose removes the temp directory', async () => {
    const other = await loadFixtureClasses('clickgoto');
    await other.dispose();
    expect(other.results.size).toBeGreaterThan(0);
    expect(existsSync(new URL('../../.work/fixture-classes/', import.meta.url))).toBe(true);
  });
});
