import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { fireEvent } from '../../src/sim/systems/events';
import type { Release } from '../../src/sim/types';

function world() {
  const s = createGame({ seed: 37, companyName: 'Kind Co', founderName: 'Ada Founder', startYear: 2014, autopause: false });
  s.company.cash = 1e9;
  s.company.reputation = 30;
  const r = {
    id: 'k1', name: 'Bright Path', day: s.day - 100, score: 80, userScore: 78, active: true, units: 1e5, net: 1e6, devCost: 1e5, awards: [], weekly: [], monthly: [], week: 14, why: {}, liveIncome: 0,
    concept: { genre: 'adventure', topic: 'fantasy', monetization: 'premium', platforms: ['pc'], size: 'small', audience: 'everyone' },
    platforms: [{ platform: 'pc', potential: 1000, units: 500 }],
  } as unknown as Release;
  s.releases[r.id] = r;
  s.releaseOrder.push(r.id);
  return { s, r };
}

describe('accessibility and charity events', () => {
  for (const opt of ['patch', 'next'])
    it(`accessibility request: ${opt}`, () => {
      const { s, r } = world();
      expect(fireEvent({ s, rng: new Rng(s.rng), out: [] }, 'accessibility_request')).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === 'accessibility_request')!;
      const rep = s.company.reputation;
      dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt });
      expect(r.accessibilityAsked).toBe(true);
      expect(s.company.reputation).toBeGreaterThan(rep);
      if (opt === 'patch') expect(r.userScore).toBe(80);
      s.eventCooldowns['accessibility_request'] = 0;
      expect(fireEvent({ s, rng: new Rng(s.rng), out: [] }, 'accessibility_request')).toBe(false);
    });

  for (const opt of ['match', 'cheer'])
    it(`charity stream: ${opt}`, () => {
      const { s } = world();
      expect(fireEvent({ s, rng: new Rng(s.rng), out: [] }, 'charity_stream')).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === 'charity_stream')!;
      const fans = s.company.fans;
      dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt });
      expect(s.company.fans).toBeGreaterThanOrEqual(fans);
      if (opt === 'match') expect(s.progress.stats.donated).toBeGreaterThan(0);
    });
});
