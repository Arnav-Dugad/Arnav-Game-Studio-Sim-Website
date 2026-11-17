import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { moraleTarget } from '../../src/sim/systems/staff';
import { pledged } from '../../src/sim/systems/crunchPledge';

function studio(year = 2010) {
  const s = createGame({ seed: 8, companyName: 'Kind Co', founderName: 'Ada Founder', startYear: year, autopause: false });
  s.company.cash = 1e8;
  s.company.reputation = 30;
  return s;
}

describe('no-crunch pledge', () => {
  it('lifts morale and goodwill (once), and is unavailable before 2005', () => {
    expect(dispatch(studio(1995), { type: 'crunchPledge', on: true }).ok).toBe(false);
    const s = studio();
    const founder = s.staff['founder']!;
    const before = moraleTarget(s, founder).total;
    const rep = s.company.reputation;
    expect(dispatch(s, { type: 'crunchPledge', on: true }).ok).toBe(true);
    expect(pledged(s)).toBe(true);
    expect(s.company.reputation).toBeGreaterThan(rep);
    expect(moraleTarget(s, founder).total).toBeGreaterThan(before);
    // withdraw and re-pledge: no second helping of goodwill
    const held = s.company.reputation;
    dispatch(s, { type: 'crunchPledge', on: false });
    const rep2 = s.company.reputation;
    expect(rep2).toBeLessThan(held);
    expect(dispatch(s, { type: 'crunchPledge', on: true }).ok).toBe(false); // not believable right away
    s.day += 366;
    dispatch(s, { type: 'crunchPledge', on: true });
    expect(s.company.reputation).toBeCloseTo(rep2, 5);
  });

  it('crunching while pledged breaks it, publicly, and blocks a new pledge for years', () => {
    const s = studio();
    dispatch(s, { type: 'crunchPledge', on: true });
    const pl = availablePlatforms(s)[0]!;
    dispatch(s, { type: 'startGame', game: { name: 'Late', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    const p = Object.values(s.projects)[0]!;
    const rep = s.company.reputation;
    expect(dispatch(s, { type: 'setCrunch', projectId: p.id, on: true }).ok).toBe(true);
    expect(pledged(s)).toBe(false);
    expect(s.company.reputation).toBeLessThan(rep - 4);
    expect(s.company.moraleMods.some((m) => m.label === 'Pledge broken')).toBe(true);
    dispatch(s, { type: 'setCrunch', projectId: p.id, on: false });
    expect(dispatch(s, { type: 'crunchPledge', on: true }).ok).toBe(false);
    s.day += 365 * 3 + 1;
    expect(dispatch(s, { type: 'crunchPledge', on: true }).ok).toBe(true);
  });
});
