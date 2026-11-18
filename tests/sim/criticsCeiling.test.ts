import { describe, expect, it } from 'vitest';
import { SCORE_CEILING, SCORE_KNEE, criticsCeiling } from '../../src/sim/systems/dev';
import { pitchText } from '../../src/sim/systems/pitches';

describe('critics’ high bar', () => {
  it('leaves ordinary scores alone and bends the top toward a ceiling set by size', () => {
    expect(criticsCeiling(70, 'small')).toBe(70);
    expect(criticsCeiling(SCORE_KNEE, 'large')).toBe(SCORE_KNEE);
    for (const size of ['small', 'medium', 'large', 'aaa'] as const) {
      let prev = 0;
      for (let raw = 60; raw <= 160; raw += 5) {
        const v = criticsCeiling(raw, size);
        expect(v).toBeGreaterThanOrEqual(prev); // more quality never hurts
        expect(v).toBeLessThan(SCORE_CEILING[size]);
        prev = v;
      }
    }
    // a near-perfect small game lands in the high 80s; the same quality in a large game goes further
    expect(criticsCeiling(99, 'small')).toBeLessThan(90);
    expect(criticsCeiling(99, 'small')).toBeGreaterThan(87);
    expect(criticsCeiling(110, 'large')).toBeGreaterThan(criticsCeiling(110, 'medium'));
  });
});

describe('pitch wording', () => {
  it('never doubles the genre', () => {
    expect(pitchText({ genre: 'sports', topic: 'sports_topic' })).toBe('Pro Sports game');
    expect(pitchText({ genre: 'strategy', topic: 'fantasy' }, true)).toMatch(/^a Fantasy strategy game$/);
  });
});
