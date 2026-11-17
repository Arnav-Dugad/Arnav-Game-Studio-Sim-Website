import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { toDay } from '../../src/sim/calendar';
import { availablePlatforms } from '../../src/sim/systems/market';
import { EVENT_DEFS, fireEvent } from '../../src/sim/systems/events';
import type { GameState, Staff } from '../../src/sim/types';

function veteranStudio(): GameState {
  const s = createGame({ seed: 4, companyName: 'Test', founderName: 'T', startYear: 1990, autopause: false });
  s.company.cash = 1e9;
  s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 25 } as never;
  const pl = availablePlatforms(s)[0]!;
  dispatch(s, { type: 'startGame', game: { name: 'Oldie', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
  const f = s.staff['founder']!;
  s.staff['v1'] = { ...structuredClone(f), id: 'v1', name: 'Vera Senior', role: 'designer', level: 'senior', assignment: { kind: 'idle' }, deskId: undefined } as Staff;
  s.alumni = [{ name: 'Old Timer', role: 'artist', years: 12, games: 4, day: s.day, legend: false }];
  return s;
}

describe('community & legacy events', () => {
  for (const id of ['preservation_society', 'guest_lecture', 'childrens_hospital', 'fan_cover_song', 'tell_all_memoir'])
    it(`${id}: fires and every option resolves`, () => {
      const def = EVENT_DEFS.find((d) => d.id === id)!;
      expect(def).toBeDefined();
      const base = veteranStudio();
      // make it recent enough (cover song) or old enough (preservation)
      const rel = Object.values(base.releases)[0]!;
      if (id === 'preservation_society') base.day = rel.day + 365 * 16;
      if (id === 'fan_cover_song') {
        base.day = toDay(2010, 3, 1);
        rel.day = base.day - 100;
      }
      if (id === 'tell_all_memoir') base.day = toDay(1996, 3, 1);
      expect(def.weight(base)).toBeGreaterThan(0);
      const c = { s: base, rng: new Rng(base.rng), out: [] };
      expect(fireEvent(c, id)).toBe(true);
      const ev = base.pendingEvents.find((e) => e.defId === id)!;
      for (const opt of ev.options) {
        const s2 = structuredClone(base);
        const ev2 = s2.pendingEvents.find((e) => e.defId === id)!;
        expect(dispatch(s2, { type: 'resolveEvent', uid: ev2.uid, option: opt.id }).ok).toBe(true);
      }
    });
});
