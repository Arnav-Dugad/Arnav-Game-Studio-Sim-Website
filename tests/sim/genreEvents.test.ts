import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { fireEvent } from '../../src/sim/systems/events';
import type { GameState, Release } from '../../src/sim/types';

function withGame(genre: string, year = 2005) {
  const s = createGame({ seed: 17, companyName: 'Genre Co', founderName: 'Ada Founder', startYear: year, autopause: false });
  s.company.cash = 1e8;
  const r = {
    id: 'g1', name: 'Royal Hand', day: s.day - 200, score: 82, userScore: 80, active: true, units: 1e5, net: 1e6, devCost: 1e5, awards: [], weekly: [], monthly: [], week: 30, why: {}, liveIncome: 0,
    concept: { genre, topic: 'fantasy', monetization: 'premium', platforms: ['pc'], size: 'small', audience: 'teen' },
    platforms: [{ platform: 'pc', potential: 1000, units: 500 }],
  } as unknown as Release;
  s.releases[r.id] = r;
  s.releaseOrder.push(r.id);
  return { s, r };
}
const ctx = (s: GameState) => ({ s, rng: new Rng(s.rng), out: [] });

describe('genre events', () => {
  for (const opt of ['sponsor', 'cheer'])
    it(`card tournament: ${opt}`, () => {
      const { s, r } = withGame('cards');
      expect(fireEvent(ctx(s), 'card_tournament')).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === 'card_tournament')!;
      expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt }).ok).toBe(true);
      if (opt === 'sponsor') expect(r.platforms[0]!.potential).toBeGreaterThan(1000);
    });

  for (const opt of ['official', 'bless', 'no'])
    it(`fan translation: ${opt}`, () => {
      const { s, r } = withGame('visual_novel');
      const rep = s.company.reputation;
      expect(fireEvent(ctx(s), 'fan_translation')).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === 'fan_translation')!;
      expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt }).ok).toBe(true);
      expect(r.fanTranslated).toBe(true);
      if (opt === 'no') expect(s.company.reputation).toBeLessThan(rep);
      else expect(r.platforms[0]!.potential).toBeGreaterThan(1000);
      // never asked twice about the same game
      s.eventCooldowns['fan_translation'] = 0;
      expect(fireEvent(ctx(s), 'fan_translation')).toBe(false);
    });
});
