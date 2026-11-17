import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { advance } from '@/sim/advance';
import { dispatch } from '@/sim/actions';
import { ambitionsWeekly } from '@/sim/systems/ambitions';
import { Rng } from '@/sim/rng';
import type { Ctx } from '@/sim/ctx';

function game() {
  const s = createGame({ seed: 11, companyName: 'Amb', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });
  return s;
}

describe('staff ambitions', () => {
  it('appear over time, never for the founder, and stay under the cap', () => {
    const s = game();
    s.company.cash = 1e9; // stay solvent: this is about ambitions, not payroll
    for (let i = 0; i < 25; i++) dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: i % 2 ? 'programmer' : 'artist', skill: 40, salary: 30_000 } });
    advance(s, 365 * 2);
    expect(s.status).toBe('running');
    const staff = Object.values(s.staff);
    expect(staff.find((x) => x.role === 'founder')?.ambition).toBeUndefined();
    const active = staff.filter((x) => x.ambition).length;
    expect(active).toBeLessThanOrEqual(Math.max(2, Math.round(staff.filter((x) => x.role !== 'founder').length * 0.15)));
    const seen = active + (s.progress.stats.dreamsMet ?? 0) + s.news.filter((n) => /feels overlooked/.test(n.headline)).length;
    expect(seen).toBeGreaterThan(0);
  });

  it('a raise ambition is fulfilled by paying the target, with loyalty and a morale term', () => {
    const s = game();
    dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'programmer', skill: 40, salary: 30_000 } });
    const st = Object.values(s.staff).find((x) => x.role !== 'founder')!;
    st.ambition = { kind: 'raise', since: s.day, until: s.day + 100, target: st.salary + 5000 };
    const loyalty = st.loyalty;
    dispatch(s, { type: 'setSalary', staffId: st.id, salary: st.salary + 5000 });
    const c: Ctx = { s, rng: new Rng(s.rng), out: [] };
    ambitionsWeekly(c);
    expect(st.ambition).toBeUndefined();
    expect(st.loyalty).toBeGreaterThan(loyalty);
    expect(st.mood?.label).toBe('Dream come true');
  });

  it('taking a promised raise back is a broken promise', () => {
    const s = game();
    dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'programmer', skill: 40, salary: 30_000 } });
    const st = Object.values(s.staff).find((x) => x.role !== 'founder')!;
    const old = st.salary;
    st.ambition = { kind: 'raise', since: s.day, until: s.day + 100, target: old + 5000 };
    dispatch(s, { type: 'setSalary', staffId: st.id, salary: old + 5000 });
    const c: Ctx = { s, rng: new Rng(s.rng), out: [] };
    ambitionsWeekly(c);
    const after = st.loyalty;
    dispatch(s, { type: 'setSalary', staffId: st.id, salary: old });
    ambitionsWeekly(c);
    expect(st.loyalty).toBeLessThan(after);
    expect(st.mood?.label).toBe('Raise taken back');
  });

  it('an ignored ambition lapses with a loyalty hit', () => {
    const s = game();
    dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'programmer', skill: 40, salary: 30_000 } });
    const st = Object.values(s.staff).find((x) => x.role !== 'founder')!;
    st.ambition = { kind: 'research', since: s.day - 10, until: s.day - 1, progress: 0 };
    st.assignment = { kind: 'idle' };
    const loyalty = st.loyalty;
    const c: Ctx = { s, rng: new Rng(s.rng), out: [] };
    ambitionsWeekly(c);
    expect(st.ambition).toBeUndefined();
    expect(st.loyalty).toBeLessThan(loyalty);
    expect(st.mood?.v).toBeLessThan(0);
  });
});
