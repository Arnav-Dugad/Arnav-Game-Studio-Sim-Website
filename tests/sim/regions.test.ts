import { describe, expect, it } from 'vitest';
import { REGIONS, regionMix, regionShares } from '@/data/regions';
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { salesPotential } from '@/sim/systems/release';
import { availablePlatforms } from '@/sim/systems/market';

describe('regions & localisation', () => {
  it('shares sum to 1 in every era; an unlocalised North American game is the baseline', () => {
    for (const y of [1980, 1993, 2007, 2026, 2060]) {
      const sh = regionShares(y);
      expect(Object.values(sh).reduce((t, v) => t + v, 0)).toBeCloseTo(1, 6);
      expect(regionMix(y, 'rpg', 'na', []).mul).toBeCloseTo(1, 9);
      // the home region matters both ways, but fully localised is the same wherever you're based
      for (const home of REGIONS) expect(regionMix(y, 'rpg', home.id, ['na', 'eu', 'jp', 'row']).mul).toBeCloseTo(regionMix(y, 'rpg', 'na', ['eu', 'jp', 'row']).mul, 9);
    }
  });

  it('localising helps most where the genre is loved, and the home region is free', () => {
    expect(regionMix(1995, 'rpg', 'na', ['jp']).mul).toBeGreaterThan(regionMix(1995, 'sports', 'na', ['jp']).mul);
    expect(regionMix(1995, 'rpg', 'jp', ['jp']).mul).toBeCloseTo(regionMix(1995, 'rpg', 'jp', []).mul, 9);
    // a small home market starts behind
    expect(regionMix(1985, 'rpg', 'row', []).mul).toBeLessThan(1);
    expect(regionMix(2020, 'rpg', 'na', ['eu', 'jp', 'row']).mul).toBeLessThan(1.6);
  });

  it('startGame charges for localisation, adds work, rejects unknown regions, and sales potential rises', () => {
    const s = createGame({ seed: 3, companyName: 'Loc', founderName: 'F', startYear: 1995, endless: true, autopause: false, difficulty: 'standard' });
    s.company.cash = 10_000_000;
    s.research.done.push('biz_self_publishing');
    const pl = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
    const team = [Object.keys(s.staff)[0]!];
    const base = { name: 'Quest', genre: 'rpg' as const, topic: 'fantasy', platforms: [pl], audience: 'teen' as const, size: 'small' as const, monetization: 'premium' as const, engineId: 'e0', team };
    expect(dispatch(s, { type: 'startGame', game: { ...base, localized: ['mars' as never] } }).ok).toBe(false);
    const cash = s.company.cash;
    const r = dispatch(s, { type: 'startGame', game: { ...base, localized: ['jp', 'eu', 'na'] } });
    expect(r.ok).toBe(true);
    const p = Object.values(s.projects).find((x) => x.kind === 'game')!;
    if (p.kind !== 'game') throw new Error('no game');
    expect(p.concept.localized).toEqual(['jp', 'eu']); // home (na) dropped
    expect(s.company.cash).toBeLessThan(cash);
    const plain = salesPotential(s, { ...p.concept, localized: undefined }, 75, 0.2);
    const loc = salesPotential(s, p.concept, 75, 0.2);
    const sum = (x: typeof plain) => x.platforms.reduce((t, q) => t + q.potential, 0);
    expect(sum(loc) / sum(plain)).toBeCloseTo(regionMix(1995, 'rpg', 'na', ['jp', 'eu']).mul, 6);
  });
});

describe('branch offices', () => {
  it('open with reputation and cash, add rent, and make localisation there free and a little stronger', () => {
    const s = createGame({ seed: 4, companyName: 'Br', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });
    expect(dispatch(s, { type: 'openBranch', region: 'jp' }).ok).toBe(false); // reputation
    s.company.reputation = 50;
    s.company.cash = 50_000_000;
    expect(dispatch(s, { type: 'openBranch', region: 'na' }).ok).toBe(false); // home
    expect(dispatch(s, { type: 'openBranch', region: 'jp' }).ok).toBe(true);
    expect(dispatch(s, { type: 'openBranch', region: 'jp' }).ok).toBe(false); // already open
    expect(regionMix(1990, 'rpg', 'na', [], ['jp']).mul).toBeGreaterThan(regionMix(1990, 'rpg', 'na', ['jp']).mul);
    expect(dispatch(s, { type: 'closeBranch', region: 'jp' }).ok).toBe(true);
  });
});
