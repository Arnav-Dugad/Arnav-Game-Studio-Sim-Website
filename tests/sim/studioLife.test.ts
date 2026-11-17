import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { Rng } from '@/sim/rng';
import { employeeOfTheMonth, retreatCost } from '@/sim/systems/studioLife';

function studio() {
  const s = createGame({ seed: 31, companyName: 'Life', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });
  s.company.cash = 2_000_000;
  dispatch(s, { type: 'cheat', cheat: { op: 'officeTier', tier: 3 } });
  for (let i = 0; i < 5; i++) dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'artist', skill: 40, salary: 30_000 } });
  return s;
}

describe('studio life', () => {
  it('Employee of the Month goes to the biggest contributor since last month', () => {
    const s = studio();
    const c = { s, rng: new Rng(s.rng), out: [] };
    employeeOfTheMonth(c); // sets the marks
    const staff = Object.values(s.staff).filter((x) => x.role !== 'founder');
    staff[2]!.contributed += 500;
    staff[3]!.contributed += 200;
    employeeOfTheMonth(c);
    expect(s.eotm?.id).toBe(staff[2]!.id);
    expect(staff[2]!.eotmCount).toBe(1);
    expect(staff[2]!.mood?.label).toBe('Employee of the Month');
  });

  it('a retreat costs money, lifts morale and can only happen once a year', () => {
    const s = studio();
    const cash = s.company.cash;
    const cost = retreatCost(s);
    expect(dispatch(s, { type: 'teamRetreat' }).ok).toBe(true);
    expect(s.company.cash).toBeCloseTo(cash - cost, 0);
    expect(s.company.moraleMods.some((m) => m.label === 'Team retreat')).toBe(true);
    expect(dispatch(s, { type: 'teamRetreat' }).ok).toBe(false);
    s.day += 366;
    expect(dispatch(s, { type: 'teamRetreat' }).ok).toBe(true);
  });
});
