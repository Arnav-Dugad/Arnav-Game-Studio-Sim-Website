import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng, seedRng } from '../../src/sim/rng';
import { toDay } from '../../src/sim/calendar';
import { fireEvent } from '../../src/sim/systems/events';
import { availablePlatforms, platformInfo } from '../../src/sim/systems/market';
import { breakoutCandidate } from '../../src/sim/systems/mods';
import type { GameState, Release } from '../../src/sim/types';

function setup(seed: number): { s: GameState; r: Release } {
  const s = createGame({ seed, companyName: 'Mod Co', founderName: 'Ada Founder', startYear: 2004, autopause: false });
  s.day = toDay(2006, 5, 1);
  s.company.cash = 1e8;
  const pc = availablePlatforms(s).find((p) => platformInfo(s, p.id)?.kind === 'computer')!;
  const r = {
    id: 'r1', name: 'Steel Horizon', day: toDay(2005, 3, 1), score: 84, userScore: 80, modded: true, week: 60, price: 40, active: false,
    concept: { name: 'Steel Horizon', genre: 'shooter', topic: 'military', platforms: [pc.id] },
    platforms: [{ platform: pc.id, potential: 500_000, units: 480_000 }],
    units: 480_000, awards: [],
  } as unknown as Release;
  s.releases.r1 = r;
  s.releaseOrder.push('r1');
  return { s, r };
}

describe('breakout mods', () => {
  it('only loved, modded PC games that have been out a while qualify', () => {
    const { s, r } = setup(1);
    expect(breakoutCandidate(s)).toBe(r);
    r.modded = false;
    expect(breakoutCandidate(s)).toBeUndefined();
    r.modded = true;
    r.score = 60;
    expect(breakoutCandidate(s)).toBeUndefined();
    r.score = 84;
    r.day = s.day - 30;
    expect(breakoutCandidate(s)).toBeUndefined();
  });

  it('each choice revives the game once; hiring brings the modder and their pitch', () => {
    for (const opt of ['hire', 'buy', 'feature'] as const) {
      const { s, r } = setup(3);
      const staff = Object.keys(s.staff).length;
      expect(fireEvent({ s, rng: new Rng(seedRng(3)), out: [] }, 'breakout_mod')).toBe(true);
      const ev = s.pendingEvents.find((e) => e.defId === 'breakout_mod')!;
      expect(ev.options.map((o) => o.id)).toContain(opt);
      expect(dispatch(s, { type: 'resolveEvent', uid: ev.uid, option: opt }).ok).toBe(true);
      expect(r.breakoutMod?.choice).toBe(opt);
      expect(r.active).toBe(true);
      expect(r.platforms[0]!.revival!.potential).toBeGreaterThan(0);
      if (opt === 'hire') {
        expect(Object.keys(s.staff).length).toBe(staff + 1);
        expect(s.company.pitch?.genre).toBe(String(ev.ctx.genre));
        expect(r.breakoutMod?.by).toBeTruthy();
      } else expect(Object.keys(s.staff).length).toBe(staff);
      if (opt === 'buy') expect(r.userScore).toBe(82);
      expect(breakoutCandidate(s)).toBeUndefined(); // one breakout per game
    }
  });
});
