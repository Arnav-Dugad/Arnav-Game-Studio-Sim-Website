import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { CHECKIN_COOLDOWN, checkInLimit, checkInTopic } from '../../src/sim/systems/checkIns';

function studio(n: number) {
  const s = createGame({ seed: 3, companyName: 'Chat Co', founderName: 'Ada Founder', startYear: 1995, autopause: false });
  s.company.cash = 1e8;
  s.office.tier = 3 as never;
  for (let i = 0; i < n; i++) dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'programmer', skill: 40, salary: 30_000 } });
  return s;
}

describe('one-on-ones', () => {
  it('they say what is really bothering them, and feel heard', () => {
    const s = studio(1);
    const st = Object.values(s.staff).find((x) => x.role !== 'founder')!;
    st.burnout = 75;
    expect(checkInTopic(s, st).topic).toBe('burnout');
    const loyalty = st.loyalty;
    expect(dispatch(s, { type: 'checkIn', staffId: st.id }).ok).toBe(true);
    expect(st.burnout).toBe(67);
    expect(st.loyalty).toBeGreaterThan(loyalty);
    expect(st.checkIn?.line).toMatch(/empty/);
    expect(st.mood?.v).toBeGreaterThan(0);
  });

  it('underpaid staff talk about pay', () => {
    const s = studio(1);
    const st = Object.values(s.staff).find((x) => x.role !== 'founder')!;
    st.salary = 1_000;
    expect(checkInTopic(s, st).topic).toBe('pay');
  });

  it('respects the cooldown, the founder and the calendar', () => {
    const s = studio(12);
    const founder = s.staff['founder']!;
    expect(dispatch(s, { type: 'checkIn', staffId: founder.id }).ok).toBe(false);
    const people = Object.values(s.staff).filter((x) => x.role !== 'founder');
    expect(people.length).toBeGreaterThan(checkInLimit(s));
    expect(dispatch(s, { type: 'checkIn', staffId: people[0]!.id }).ok).toBe(true);
    expect(dispatch(s, { type: 'checkIn', staffId: people[0]!.id }).ok).toBe(false); // cooldown
    let ok = 1;
    for (const p of people.slice(1)) if (dispatch(s, { type: 'checkIn', staffId: p.id }).ok) ok++;
    expect(ok).toBe(checkInLimit(s));
    s.day += CHECKIN_COOLDOWN;
    expect(dispatch(s, { type: 'checkIn', staffId: people[0]!.id }).ok).toBe(true);
  });

  it('never lowers a good mood', () => {
    const s = studio(1);
    const st = Object.values(s.staff).find((x) => x.role !== 'founder')!;
    st.mood = { v: 10, until: s.day + 100, label: 'Dream come true' };
    dispatch(s, { type: 'checkIn', staffId: st.id });
    expect(st.mood.v).toBe(10);
  });
});
