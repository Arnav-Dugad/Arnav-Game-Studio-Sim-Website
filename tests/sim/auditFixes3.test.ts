import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { advance } from '../../src/sim/advance';
import { canFoundLeague, ESPORTS_RESEARCH } from '../../src/sim/systems/esports';
import { adoptableIpValue, offerPrice } from '../../src/sim/systems/rivals';
import { toDay } from '../../src/sim/calendar';
import type { GameState } from '../../src/sim/types';

function studio(year: number, seed = 11): GameState {
  const s = createGame({ seed, companyName: 'Audit Three', founderName: 'A', startYear: year, autopause: false });
  s.company.cash = 5_000_000_000;
  return s;
}

describe('acquisition offers', () => {
  it('charge for any series of theirs that came out after the price was agreed', () => {
    const s = studio(2012);
    s.day = toDay(2012, 8, 10); // before Candy Crush Saga (November 2012)
    const ip = adoptableIpValue(s, 'king');
    const offer = { id: 'king', price: 1_000_000, ip, expiresDay: s.day + 90 };
    expect(offerPrice(s, offer)).toBe(1_000_000);
    s.day = toDay(2012, 11, 20); // it's out: buying King now brings it, so it's in the price
    expect(adoptableIpValue(s, 'king')).toBeGreaterThan(ip);
    expect(offerPrice(s, offer)).toBe(Math.round(1_000_000 + adoptableIpValue(s, 'king') - ip));
    expect(offerPrice(s, { id: 'king', price: 1_000_000, expiresDay: s.day + 90 })).toBe(1_000_000); // older saves: as agreed
  });
});

describe('input checks', () => {
  it('a subsidiary can’t be given a budget or genre that doesn’t exist', () => {
    const s = studio(2005);
    s.subsidiaries.sub1 = { id: 'sub1', name: 'Sub', origin: 'sub1', staff: 20, quality: 0.5, genres: ['action'], budget: 'normal', nextReleaseDay: s.day + 100, releases: 0, revenue: 0, bought: s.day } as never;
    expect(dispatch(s, { type: 'setSubsidiary', id: 'sub1', budget: 'bogus' as never }).ok).toBe(false);
    expect(dispatch(s, { type: 'setSubsidiary', id: 'sub1', budget: 'high', focusGenre: 'nope' as never }).ok).toBe(false);
    expect(dispatch(s, { type: 'setSubsidiary', id: 'sub1', budget: 'high', focusGenre: 'action' }).ok).toBe(true);
    expect(() => advance(s, 40)).not.toThrow();
  });

  it('a console needs a price and a licence fee', () => {
    const s = studio(2005);
    const r = dispatch(s, { type: 'designConsole', name: 'Box', kind: 'console', tier: 'mid', marketing: 'normal' } as never);
    expect(r.ok).toBe(false);
  });
});

describe('sold series', () => {
  it('can’t get a new esports league', () => {
    const s = studio(2015);
    s.research.done.push(ESPORTS_RESEARCH);
    s.company.reputation = 90;
    const rel = { id: 'rz', name: 'Zed', day: s.day - 100, score: 90, concept: { genre: 'shooter', franchiseId: 'gone', platforms: [], monetization: 'premium' } } as never;
    expect(canFoundLeague(s, rel)).toBe('You sold this IP');
  });
});
