import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { salesPotential } from '../../src/sim/systems/release';
import { priceDemandMul, priceTierOf, priceUserEffect } from '../../src/sim/systems/pricing';
import type { PriceTier } from '../../src/sim/types';

function ship(tier: PriceTier, monetization: 'premium' | 'f2p' = 'premium') {
  const s = createGame({ seed: 21, companyName: 'Price Co', founderName: 'Ada Founder', startYear: 2012, autopause: false });
  s.company.cash = 1e8;
  s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 20 } as never;
  const pl = availablePlatforms(s).find((p) => p.kind === 'computer') ?? availablePlatforms(s)[0]!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Tag', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization, engineId: 'e0', team: ['founder'], priceTier: tier } });
  expect(r.ok).toBe(true);
  const p = Object.values(s.projects).find((x) => x.kind === 'game')!;
  const concept = p.kind === 'game' ? p.concept : undefined;
  for (let i = 0; i < 30 && Object.keys(s.projects).length; i++) advance(s, 30);
  return { s, concept: concept!, rel: Object.values(s.releases)[0]! };
}

describe('price tiers', () => {
  it('budget sells to more people at a lower price; premium the other way round', () => {
    const b = ship('budget');
    const st = ship('standard');
    const pr = ship('premium');
    expect(b.concept.priceTier).toBe('budget');
    expect(st.concept.priceTier).toBeUndefined();
    expect(b.rel.price).toBeLessThan(st.rel.price);
    expect(pr.rel.price).toBeGreaterThan(st.rel.price);
    const pot = (x: typeof b) => salesPotential(x.s, x.concept, 75, 0).platforms.reduce((t, p) => t + p.potential, 0);
    expect(pot(b)).toBeGreaterThan(pot(st));
    expect(pot(pr)).toBeLessThan(pot(st));
  });

  it('only applies to full-price games', () => {
    const f = ship('premium', 'f2p');
    expect(f.concept.priceTier).toBeUndefined();
    expect(priceTierOf({ monetization: 'f2p', priceTier: 'premium' })).toBe('standard');
  });

  it('a premium price is only forgiven for a great game', () => {
    expect(priceUserEffect('premium', 90)).toBe(0);
    expect(priceUserEffect('premium', 70)).toBeLessThan(0);
    expect(priceUserEffect('budget', 70)).toBeGreaterThan(0);
    expect(priceDemandMul('premium', 90)).toBeGreaterThan(priceDemandMul('premium', 70));
  });
});
