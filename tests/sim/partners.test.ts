import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch, devkitCost } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { favour, holderOf, partnersMonthly } from '../../src/sim/systems/partners';

describe('platform partners', () => {
  it('a great exclusive wins the holder’s favour; favour cuts devkit prices and fades', () => {
    const s = createGame({ seed: 3, companyName: 'Test', founderName: 'T', startYear: 1992, autopause: false });
    s.company.cash = 1e8;
    s.research.done.push('biz_self_publishing');
    s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 25 } as never;
    const pl = availablePlatforms(s).find((p) => holderOf(s, p.id))!;
    const maker = holderOf(s, pl.id)!;
    const kit = devkitCost(s, pl.id);
    dispatch(s, { type: 'startGame', game: { name: 'Excl', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const rel = Object.values(s.releases)[0]!;
    expect(rel.score).toBeGreaterThan(80);
    expect(favour(s, maker)).toBeGreaterThan(51); // a small game moves it a little
    s.partners![maker] = 90;
    expect(devkitCost(s, pl.id)).toBeLessThan(kit * 0.6);
    for (let i = 0; i < 60; i++) partnersMonthly(s);
    expect(favour(s, maker)).toBeLessThan(70);
  });
});
