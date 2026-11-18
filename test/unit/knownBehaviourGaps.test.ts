import { describe, expect, it } from 'vitest';
import { KNOWN_BEHAVIOUR_GAPS, knownBehaviourGapsFor } from '../../src/verify/core/constants';

describe('known behaviour gaps per sample', () => {
  it('lists a gap for static_text and slider_component', () => {
    expect(knownBehaviourGapsFor('static_text').length).toBeGreaterThan(0);
    expect(knownBehaviourGapsFor('slider_component').length).toBeGreaterThan(0);
  });

  it('adds nothing for a sample without an entry, and nothing for inherited object keys', () => {
    expect(knownBehaviourGapsFor('clickgoto')).toEqual([...KNOWN_BEHAVIOUR_GAPS]);
    expect(knownBehaviourGapsFor('constructor')).toEqual([...KNOWN_BEHAVIOUR_GAPS]);
  });
});
