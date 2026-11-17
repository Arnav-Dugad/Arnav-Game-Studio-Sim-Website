import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';
import { fireEvent } from '../../src/sim/systems/events';
import type { GameProject } from '../../src/sim/types';

const IDS = ['feature_creep', 'tech_breakthrough', 'lost_build', 'composer_offer', 'playtest_surprise'];

describe('development events', () => {
  for (const id of IDS)
    it(`${id}: every option resolves cleanly`, () => {
      const s = createGame({ seed: 2, companyName: 'Test', founderName: 'T', startYear: 1995, autopause: false });
      s.company.cash = 1e8;
      s.releaseOrder.push('fake'); // allow a medium game
      const pl = availablePlatforms(s)[0]!;
      const f = s.staff['founder']!;
      s.staff['p1'] = { ...structuredClone(f), id: 'p1', name: 'Pat Coder', role: 'programmer', assignment: { kind: 'idle' }, deskId: undefined };
      const r = dispatch(s, { type: 'startGame', game: { name: 'Dev', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'medium', monetization: 'premium', engineId: 'e0', team: ['founder', 'p1'] } });
      expect(r.ok).toBe(true);
      const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
      p.phase = 1;
      const c = { s, rng: new Rng(s.rng), out: [] };
      expect(fireEvent(c, id)).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === id)!;
      const days = p.phaseDays[1] + p.extraDays;
      const opt = ev.options.find((o) => !o.disabled && o.id !== 'no' && o.id !== 'skip' && o.id !== 'keep' && o.id !== 'weekend') ?? ev.options[0]!;
      expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt.id }).ok).toBe(true);
      expect(s.pendingEvents.some((e) => e.uid === ev.uid)).toBe(false);
      if (['add', 'harden', 'redo', 'expand'].includes(opt.id)) expect(p.phaseDays[1] + p.extraDays).toBeGreaterThan(days);
    });
});
