// The moon row beside "The ritual" shows the owner's seven painted phases in month order, one shipped
// WebP each (web/scripts/build-art.py cuts them from one sheet), and nothing else of the old drawn moon.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOON_PHASES } from '../../web/client/src/art';
import { REPO_ROOT } from '../../web/server/main';

const ART = join(REPO_ROOT, 'web', 'client', 'public', 'art');

describe('moon phases', () => {
  it('runs waxing crescent to full to waning crescent', () => {
    expect(MOON_PHASES).toEqual(['waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent']);
  });

  it('ships one small WebP per phase and no other moon art', () => {
    for (const p of MOON_PHASES) {
      const file = join(ART, `moon-${p}.webp`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeLessThan(60 * 1024);
    }
    const moons = readdirSync(ART).filter((f) => f.startsWith('moon-'));
    expect(moons.sort()).toEqual(MOON_PHASES.map((p) => `moon-${p}.webp`).sort());
  });
});
