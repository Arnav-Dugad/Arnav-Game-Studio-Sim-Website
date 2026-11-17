import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { toDay } from '../../src/sim/calendar';
import { yearlyAwards } from '../../src/sim/systems/release';
import type { GameState, Release } from '../../src/sim/types';

function season(myScore: number, rivalScore: number) {
  const s = createGame({ seed: 12, companyName: 'Gala Co', founderName: 'Ada Founder', startYear: 2000, autopause: false });
  s.company.cash = 1e8;
  s.day = toDay(2000, 10, 1);
  const r = { id: 'mine', name: 'Contender', day: toDay(2000, 3, 1), score: myScore, userScore: 70, awards: [], concept: { genre: 'rpg', topic: 'fantasy' }, platforms: [], units: 1, net: 1, devCost: 1 } as unknown as Release;
  s.releases[r.id] = r;
  s.releaseOrder.push(r.id);
  s.rivalGames = [{ name: 'Rival Epic', company: Object.keys(s.rivals)[0]!, score: rivalScore, genre: 'rpg', day: toDay(2000, 5, 1), platforms: [] } as never];
  return { s, r };
}
const goty = (s: GameState) => s.awardHistory?.[s.awardHistory.length - 1]?.winners.find((w) => w.category === 'Game of the Year');
const ctx = (s: GameState) => ({ s, rng: new Rng(s.rng), out: [] });

describe('awards campaigns', () => {
  it('tips a close race', () => {
    const a = season(85, 86);
    yearlyAwards(ctx(a.s), 2000);
    expect(goty(a.s)?.mine).toBe(false);
    const b = season(85, 86);
    expect(dispatch(b.s, { type: 'awardsCampaign', releaseId: 'mine' }).ok).toBe(true);
    yearlyAwards(ctx(b.s), 2000);
    expect(goty(b.s)?.mine).toBe(true);
    expect(goty(b.s)?.score).toBe(85); // the jury's nudge isn't printed as the score
  });

  it('can’t win a hopeless race, and only one campaign a year from September', () => {
    const c = season(82, 70);
    dispatch(c.s, { type: 'awardsCampaign', releaseId: 'mine' });
    yearlyAwards(ctx(c.s), 2000);
    expect(goty(c.s)?.mine).toBeFalsy(); // 82 + 2 is still short of 85
    const d = season(90, 70);
    d.s.day = toDay(2000, 6, 1);
    expect(dispatch(d.s, { type: 'awardsCampaign', releaseId: 'mine' }).ok).toBe(false);
    d.s.day = toDay(2000, 9, 2);
    expect(dispatch(d.s, { type: 'awardsCampaign', releaseId: 'mine' }).ok).toBe(true);
    expect(dispatch(d.s, { type: 'awardsCampaign', releaseId: 'mine' }).ok).toBe(false);
  });
});
