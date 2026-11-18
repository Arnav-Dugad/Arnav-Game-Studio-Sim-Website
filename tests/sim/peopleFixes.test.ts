import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { fireEvent, resolveEvent } from '../../src/sim/systems/events';
import { retreatBlocked } from '../../src/sim/systems/studioLife';
import { ambitionsWeekly } from '../../src/sim/systems/ambitions';
import { objectiveProgress } from '../../src/sim/systems/objectives';
import { Rng } from '../../src/sim/rng';
import type { GameState, Staff } from '../../src/sim/types';

function studio(year = 2000, seed = 21): GameState {
  const s = createGame({ seed, companyName: 'People Co', founderName: 'P', startYear: year, autopause: false });
  s.company.cash = 50_000_000;
  const f = Object.values(s.staff)[0]!;
  for (let i = 0; i < 5; i++) {
    const id = `p${i}`;
    s.staff[id] = { ...(JSON.parse(JSON.stringify(f)) as Staff), id, name: `Person ${i}`, role: 'programmer', level: 'mid', loyalty: 30, hiredDay: s.day - 400, assignment: { kind: 'idle' } };
  }
  return s;
}
const ctx = (s: GameState) => ({ s, rng: new Rng([5, 6, 7, 8]), out: [] });
const fire = (s: GameState, id: string) => {
  const c = ctx(s);
  expect(fireEvent(c, id)).toBe(true);
  return s.pendingEvents[s.pendingEvents.length - 1]!;
};

describe('people events', () => {
  it('a retreat from the team’s request counts as this year’s retreat', () => {
    const s = studio();
    const ev = fire(s, 'team_retreat');
    expect(resolveEvent(ctx(s), ev.uid, 'go')).toBe(true);
    expect(s.company.lastRetreatDay).toBe(s.day);
    expect(retreatBlocked(s)).toMatch(/Next retreat/);
  });

  it('a counter-offer raise is a promise: cutting it back within the year is noticed', () => {
    const s = studio();
    const ev = fire(s, 'poach_offer');
    const st = s.staff[String(ev.ctx.staff)]!;
    expect(resolveEvent(ctx(s), ev.uid, 'counter')).toBe(true);
    expect(st.promise?.salary).toBe(st.salary);
    const loyal = st.loyalty;
    st.salary = Math.round(st.salary * 0.8);
    ambitionsWeekly(ctx(s));
    expect(st.loyalty).toBeLessThan(loyal);
  });

  it('a lead is never offered the lead-role promise', () => {
    const s = studio();
    for (const st of Object.values(s.staff)) if (st.role !== 'founder') st.level = 'lead';
    const ev = fire(s, 'poach_offer');
    expect(ev.options.find((o) => o.id === 'promise')?.disabled).toBe(true);
  });

  it('summer interns never form year-long ambitions', () => {
    const s = studio();
    for (const st of Object.values(s.staff)) if (st.role !== 'founder') st.intern = { until: s.day + 60 };
    for (let w = 0; w < 60; w++) ambitionsWeekly(ctx(s));
    expect(Object.values(s.staff).filter((x) => x.ambition).length).toBe(0);
  });
});

describe('quarterly score goal', () => {
  it('shows no progress until a game actually reaches the score', () => {
    const s = studio();
    expect(objectiveProgress(s, { kind: 'score', target: 60, base: 0, until: s.day + 90 })).toBe(0);
  });
});
