// The moon row's phases are true phases: the outer half-circle on the lit side and an elliptical
// terminator, waxing lit on the right, waning on the left; the unlit part is shaded over the painted
// moon (art.ts moonLitPath, moonShadowPath, moonSvg).
import { describe, expect, it } from 'vitest';
import { MOON_PHASES, moonLitPath, moonShadowPath, moonSvg } from '../../web/client/src/art';

describe('moon phases', () => {
  it('runs waxing crescent to full to waning crescent', () => {
    expect(MOON_PHASES).toEqual(['waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent']);
  });

  it('lights waxing moons on the right and waning moons on the left', () => {
    // Outer edge from the top to the bottom: clockwise (sweep 1) passes the right side.
    expect(moonLitPath('waxing-crescent', 12, 10)).toContain('A10,10 0 0 1 12,22');
    expect(moonLitPath('waxing-gibbous', 12, 10)).toContain('A10,10 0 0 1 12,22');
    expect(moonLitPath('waning-crescent', 12, 10)).toContain('A10,10 0 0 0 12,22');
    expect(moonLitPath('waning-gibbous', 12, 10)).toContain('A10,10 0 0 0 12,22');
  });

  it('shapes the terminator as an ellipse: straight at a quarter, bulging toward the light in a crescent', () => {
    expect(moonLitPath('first-quarter', 12, 10)).toBe('M12,2A10,10 0 0 1 12,22A0,10 0 0 1 12,2Z');
    expect(moonLitPath('last-quarter', 12, 10)).toBe('M12,2A10,10 0 0 0 12,22A0,10 0 0 0 12,2Z');
    // A thin crescent (a fifth lit): k = r * 0.6, the terminator passing the lit side.
    expect(moonLitPath('waxing-crescent', 12, 10)).toBe('M12,2A10,10 0 0 1 12,22A6,10 0 0 0 12,2Z');
    expect(moonLitPath('waxing-gibbous', 12, 10)).toBe('M12,2A10,10 0 0 1 12,22A6,10 0 0 1 12,2Z');
    expect(moonLitPath('waning-crescent', 12, 10)).toBe('M12,2A10,10 0 0 0 12,22A6,10 0 0 1 12,2Z');
  });

  it('shades the unlit part: the lit shape of the opposite fraction on the other side', () => {
    expect(moonShadowPath('first-quarter', 12, 10)).toBe(moonLitPath('last-quarter', 12, 10));
    expect(moonShadowPath('waxing-crescent', 12, 10)).toBe(moonLitPath('waning-gibbous', 12, 10));
    expect(moonShadowPath('waning-gibbous', 12, 10)).toBe(moonLitPath('waxing-crescent', 12, 10));
    expect(moonShadowPath('full', 12, 10)).toBeNull();
  });

  it('draws each moon on the painted surface, the full one larger and unshaded', () => {
    expect(moonSvg('full')).toContain('width="28"');
    expect(moonSvg('full')).not.toContain('moon-shadow');
    expect(moonSvg('first-quarter')).toContain('width="22"');
    for (const p of MOON_PHASES) {
      const m = moonSvg(p);
      expect(m).toContain('aria-hidden="true"');
      expect(m).toContain('href="/art/moon-disc.webp"');
      expect(m).toContain('class="moon-ring"');
      if (p !== 'full') expect(m).toMatch(/class="moon-shadow".*filter="url\(#moon-[a-z-]+-soft\)"/);
    }
  });
});
