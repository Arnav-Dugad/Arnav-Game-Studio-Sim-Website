import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { productivity } from '@/sim/systems/staff';

describe('mentorship', () => {
  it('pairs a junior with a senior in the same craft, costs the mentor output, and ends on request', () => {
    const s = createGame({ seed: 12, companyName: 'Men', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });
    dispatch(s, { type: 'cheat', cheat: { op: 'officeTier', tier: 2 } });
    dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'artist', skill: 80, salary: 50_000 } });
    dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'artist', skill: 20, salary: 20_000 } });
    dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'programmer', skill: 20, salary: 20_000 } });
    const staff = Object.values(s.staff).filter((x) => x.role !== 'founder');
    const senior = staff.find((x) => x.role === 'artist' && x.level !== 'junior')!;
    const junior = staff.find((x) => x.role === 'artist' && x !== senior)!;
    const coder = staff.find((x) => x.role === 'programmer')!;
    expect(dispatch(s, { type: 'setMentor', staffId: coder.id, mentorId: senior.id }).ok).toBe(false); // other craft
    const before = productivity(s, senior).total;
    expect(dispatch(s, { type: 'setMentor', staffId: junior.id, mentorId: senior.id }).ok).toBe(true);
    expect(productivity(s, senior).total).toBeCloseTo(before * 0.97, 6);
    expect(dispatch(s, { type: 'setMentor', staffId: junior.id, mentorId: null }).ok).toBe(true);
    expect(productivity(s, senior).total).toBeCloseTo(before, 6);
  });
});
