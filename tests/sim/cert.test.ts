import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';
import type { GameProject } from '../../src/sim/types';

function buggyConsoleGame() {
  const s = createGame({ seed: 29, companyName: 'Cert Co', founderName: 'Ada Founder', startYear: 1995, autopause: false });
  s.company.cash = 1e8;
  s.research.done.push('biz_self_publishing');
  const pl = availablePlatforms(s).find((p) => p.kind === 'console')!;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Crashy', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  expect(r.ok).toBe(true);
  const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
  p.phase = 2;
  p.design = 100;
  p.tech = 100;
  p.bugs = 50;
  return { s, p };
}

describe('platform certification', () => {
  for (const [opt, days, bugs] of [['rush', 7, 45], ['fix', 14, 37.5]] as const)
    it(`${opt}: fixes bugs, costs time, and only happens once`, () => {
      const { s, p } = buggyConsoleGame();
      const c = { s, rng: new Rng(s.rng), out: [] };
      const extra = p.extraDays;
      expect(fireEvent(c, 'cert_fail')).toBe(true); // failing holds the game straight away
      expect(p.extraDays - extra).toBe(7);
      const ev = s.pendingEvents.find((e) => e.defId === 'cert_fail')!;
      dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt });
      expect(p.extraDays - extra).toBe(days);
      expect(p.bugs).toBeCloseTo(bugs, 5);
      s.eventCooldowns['cert_fail'] = 0;
      expect(fireEvent(c, 'cert_fail')).toBe(false); // certified now
    });
});
