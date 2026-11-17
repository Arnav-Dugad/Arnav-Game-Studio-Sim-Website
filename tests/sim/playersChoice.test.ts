import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { fromDay } from '../../src/sim/calendar';
import { yearlyAwards } from '../../src/sim/systems/release';
import { Rng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';

describe("Players' Choice", () => {
  it('a game players adore can win it even without the critics’ top prize', () => {
    const s = createGame({ seed: 4, companyName: 'Test', founderName: 'T', startYear: 1995, autopause: false });
    s.company.cash = 1e8;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 20 } as never;
    const pl = availablePlatforms(s)[0]!;
    dispatch(s, { type: 'startGame', game: { name: 'Loved', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const rel = Object.values(s.releases)[0]!;
    rel.userScore = 99; // the players' darling
    s.awardHistory = (s.awardHistory ?? []).filter((y) => y.year !== fromDay(rel.day).year);
    rel.awards = [];
    yearlyAwards({ s, rng: new Rng(s.rng), out: [] }, fromDay(rel.day).year);
    expect(rel.awards).toContain("Players' Choice");
  });
});
