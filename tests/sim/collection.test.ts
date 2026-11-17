import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { GameState, Release } from '../../src/sim/types';

function classic(s: GameState, id: string, score: number) {
  const r = {
    id, name: id, day: 0, score, userScore: score, active: false, units: 1e5, net: 1e6, devCost: 1e5, awards: [], weekly: [], monthly: [], week: 300, why: {}, bugs: 0, liveIncome: 0,
    concept: { genre: 'action', topic: 'space', monetization: 'premium', platforms: ['nes'], size: 'small', audience: 'teen', engineId: 'e0' },
    platforms: [{ platform: 'nes', potential: 1e5, units: 1e5 }],
  } as unknown as Release;
  s.releases[id] = r;
  s.releaseOrder.push(id);
  return r;
}

function world() {
  const s = createGame({ seed: 9, companyName: 'Retro Co', founderName: 'Ada Founder', startYear: 2008, autopause: false });
  s.company.cash = 1e9;
  s.research.done.push('biz_self_publishing');
  const lead = classic(s, 'Star Hopper', 88);
  const others = [classic(s, 'Moon Run', 80), classic(s, 'Comet Kid', 75), classic(s, 'Old Flop', 50)];
  const pl = availablePlatforms(s).find((p) => p.kind === 'computer')!;
  return { s, lead, others, pl: pl.id };
}

describe('classics collections', () => {
  it('bundling classics sells to more people, and they all count as re-released', () => {
    const a = world();
    expect(dispatch(a.s, { type: 'rerelease', releaseId: a.lead.id, platform: a.pl }).ok).toBe(true);
    const solo = a.lead.platforms[a.lead.platforms.length - 1]!.potential;
    const b = world();
    const cash = b.s.company.cash;
    expect(dispatch(b.s, { type: 'rerelease', releaseId: b.lead.id, platform: b.pl, bundle: [b.others[0]!.id, b.others[1]!.id] }).ok).toBe(true);
    const coll = b.lead.platforms[b.lead.platforms.length - 1]!.potential;
    expect(coll).toBeGreaterThan(solo * 1.5);
    expect(b.lead.collection).toEqual(['Moon Run', 'Comet Kid']);
    expect(b.others[0]!.rereleased && b.others[1]!.rereleased).toBe(true);
    expect(cash - b.s.company.cash).toBeGreaterThan(0);
    expect(b.s.news.some((n) => n.headline.includes('Star Hopper Collection'))).toBe(true);
  });

  it('only eligible classics can be bundled', () => {
    const c = world();
    expect(dispatch(c.s, { type: 'rerelease', releaseId: c.lead.id, platform: c.pl, bundle: [c.others[2]!.id] }).ok).toBe(false); // a 50 isn't a classic
    expect(dispatch(c.s, { type: 'rerelease', releaseId: c.lead.id, platform: c.pl, bundle: ['nope'] }).ok).toBe(false);
    expect(c.lead.rereleased).toBeUndefined();
  });
});
