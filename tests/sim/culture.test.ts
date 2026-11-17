import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { productivity, moraleTarget } from '@/sim/systems/staff';
import { researchRate } from '@/sim/systems/research';

const game = () => createGame({ seed: 9, companyName: 'Cul', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });

describe('studio culture', () => {
  it('rejects clashing or too many values; the first choice is free', () => {
    const s = game();
    expect(dispatch(s, { type: 'setValues', values: ['craft', 'speed'] }).ok).toBe(false);
    expect(dispatch(s, { type: 'setValues', values: ['craft', 'players', 'innovation'] }).ok).toBe(false);
    const mods = s.company.moraleMods.length;
    expect(dispatch(s, { type: 'setValues', values: ['craft', 'players'] }).ok).toBe(true);
    expect(s.company.moraleMods.length).toBe(mods);
  });

  it('changing course has a cooldown and costs morale', () => {
    const s = game();
    dispatch(s, { type: 'setValues', values: ['speed'] });
    expect(dispatch(s, { type: 'setValues', values: ['balance'] }).ok).toBe(false);
    s.day += 400;
    expect(dispatch(s, { type: 'setValues', values: ['balance'] }).ok).toBe(true);
    expect(s.company.moraleMods.some((m) => m.label === 'Culture shake-up')).toBe(true);
  });

  it('values show up in output, morale and research', () => {
    const s = game();
    const st = Object.values(s.staff)[0]!;
    const base = productivity(s, st).total;
    dispatch(s, { type: 'setValues', values: ['speed', 'innovation'] });
    expect(productivity(s, st).total).toBeCloseTo(base * 1.1, 6);
    st.assignment = { kind: 'research' };
    const s2 = game();
    const st2 = Object.values(s2.staff)[0]!;
    st2.assignment = { kind: 'research' };
    expect(researchRate(s)).toBeGreaterThan(researchRate(s2) * 1.05);
    const m0 = moraleTarget(s2, st2).total;
    dispatch(s2, { type: 'setValues', values: ['balance'] });
    expect(moraleTarget(s2, st2).total).toBeGreaterThan(m0);
  });
});
