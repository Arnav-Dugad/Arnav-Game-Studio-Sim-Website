import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { refreshOffers } from '../../src/sim/systems/offers';
import { Rng, seedRng } from '../../src/sim/rng';

describe('publisher trust', () => {
  it('trusted publishers offer more; burned ones stop calling', () => {
    const offersWith = (trust: number) => {
      const s = createGame({ seed: 5, companyName: 'T', founderName: 'T', startYear: 1995, autopause: false });
      s.company.reputation = 50;
      for (const r of Object.values(s.rivals)) (s.publisherTrust ??= {})[r.id] = trust;
      s.offers.deals = [];
      refreshOffers({ s, rng: new Rng(seedRng(9)), out: [] });
      return s.offers.deals;
    };
    const neutral = offersWith(0);
    const trusted = offersWith(5);
    expect(neutral.length).toBeGreaterThan(0);
    const avg = (d: typeof neutral) => d.reduce((t, x) => t + x.advance, 0) / Math.max(1, d.length);
    expect(avg(trusted)).toBeGreaterThan(avg(neutral) * 1.15);
    expect(offersWith(-4).length).toBe(0);
  });
});
