import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { Rng, seedRng } from '../../src/sim/rng';
import { lifeEventsMonthly, PARENTAL } from '../../src/sim/systems/lifeEvents';
import { pairKey } from '../../src/sim/systems/relations';
import type { Ctx } from '../../src/sim/ctx';
import type { GameState, Staff } from '../../src/sim/types';

function withStaff(n: number): GameState {
  const s = createGame({ seed: 3, companyName: 'Test', founderName: 'T', startYear: 2000, autopause: false });
  const f = s.staff['founder']!;
  for (let i = 0; i < n; i++) {
    const id = `x${i}`;
    s.staff[id] = { ...structuredClone(f), id, name: `Person ${i}`, role: 'programmer', assignment: { kind: 'idle' }, deskId: undefined } as Staff;
  }
  s.company.cash = 1e9;
  return s;
}

/** An rng whose rolls always succeed (chance → true). */
function lucky(): Ctx['rng'] {
  const r = new Rng(seedRng(1));
  r.next = () => 0;
  return r;
}

describe('life events', () => {
  it('over the years people marry and have babies; leave ends on time', () => {
    const s = withStaff(30);
    advance(s, 365 * 8);
    const st = s.progress.stats;
    expect((st.weddings ?? 0) + (st.babies ?? 0)).toBeGreaterThan(2);
    for (const x of Object.values(s.staff)) if ((x.vacationDays ?? 0) === 0) expect(x.leave).toBeUndefined();
  });

  it('parental leave follows the policy', () => {
    const s = withStaff(1);
    const x = s.staff['x0']!;
    x.life = { married: 1 };
    expect(dispatch(s, { type: 'setPolicy', parentalLeave: 'generous' }).ok).toBe(true);
    x.loyalty = 50;
    const loyalty = x.loyalty;
    lifeEventsMonthly({ s, rng: lucky(), out: [] });
    expect(x.life.kids).toBe(1);
    expect(x.leave).toBe('parental');
    expect(x.vacationDays).toBe(PARENTAL.generous.days);
    expect(x.loyalty).toBeGreaterThan(loyalty);
    expect(dispatch(s, { type: 'setPolicy', parentalLeave: 'bogus' as never }).ok).toBe(false);
  });

  it('minimal leave can cost you the new parent', () => {
    const s = withStaff(1);
    s.staff['x0']!.life = { married: 1 };
    dispatch(s, { type: 'setPolicy', parentalLeave: 'minimal' });
    const out: Ctx['out'] = [];
    lifeEventsMonthly({ s, rng: lucky(), out });
    expect(s.staff['x0']).toBeUndefined();
    expect(out.some((e) => e.type === 'staffQuit')).toBe(true);
  });

  it('close colleagues can fall for each other and marry', () => {
    const s = withStaff(2);
    s.relations = { [pairKey('x0', 'x1')]: 95 };
    lifeEventsMonthly({ s, rng: lucky(), out: [] });
    expect(s.staff['x0']!.life?.partnerId).toBe('x1');
    expect(s.staff['x1']!.life?.partnerId).toBe('x0');
    s.day += 400;
    lifeEventsMonthly({ s, rng: lucky(), out: [] });
    expect(s.staff['x0']!.life?.married).toBe(s.day);
    expect(s.staff['x1']!.leave).toBe('honeymoon');
    expect(s.progress.stats.officeWeddings).toBe(1);
  });
});
