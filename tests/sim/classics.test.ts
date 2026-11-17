import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { fromDay } from '../../src/sim/calendar';
import { availablePlatforms } from '../../src/sim/systems/market';
import { CLASSIC_AGE_YEARS } from '../../src/sim/systems/classics';

describe('Hall of Classics', () => {
  it('a great game gets inducted once it is ten years old, and only once', () => {
    const s = createGame({ seed: 4, companyName: 'Test', founderName: 'T', startYear: 1990, autopause: false });
    s.company.cash = 1e9;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 30, noBankruptcy: true } as never;
    const pl = availablePlatforms(s)[0]!;
    dispatch(s, { type: 'startGame', game: { name: 'Legend', genre: 'action', topic: 'fantasy', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const rel = Object.values(s.releases)[0]!;
    expect(rel.score).toBeGreaterThanOrEqual(88);
    advance(s, 365 * (CLASSIC_AGE_YEARS - 1));
    expect(rel.classic).toBeUndefined();
    advance(s, 365 * 6);
    expect(rel.classic).toBeDefined();
    expect(rel.classic! - fromDay(rel.day).year).toBeGreaterThanOrEqual(CLASSIC_AGE_YEARS);
    expect(s.progress.stats.classics).toBe(1);
  });
});
