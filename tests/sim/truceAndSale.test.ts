import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { expireEvents } from '../../src/sim/systems/events';
import { dispatch } from '../../src/sim/actions';
import { staffAutomationWeekly, marketSalary } from '../../src/sim/systems/staff';
import { Rng, seedRng } from '../../src/sim/rng';
import type { Ctx } from '../../src/sim/ctx';

function ctx(seed = 1) {
  const s = createGame({ seed, companyName: 'Truce Co', founderName: 'T', startYear: 1990, autopause: false });
  const c = { s, rng: new Rng(seedRng(seed)), out: [] } as unknown as Ctx;
  return { s, c };
}

describe('selling the studio', () => {
  it('is never the default when a buyout offer expires', () => {
    const { s, c } = ctx();
    s.pendingEvents.push({
      uid: 99,
      defId: 'buyout_offer',
      day: s.day,
      title: 'Big Co wants to buy you',
      body: '',
      options: [
        { id: 'decline', label: 'We are not for sale', preview: '' },
        { id: 'sell', label: 'Sell', preview: '', confirm: 'Sure?' },
      ],
      ctx: { rival: 'x', price: 1 },
      expiresDay: s.day,
      art: 'briefcase',
    });
    expireEvents(c);
    expect(s.status).toBe('running');
    expect(s.pendingEvents.some((e) => e.uid === 99)).toBe(false);
  });
});


describe('keep pay at market rate', () => {
  it('raises anyone behind the market, and nobody else', () => {
    const { s } = ctx(3);
    expect(dispatch(s, { type: 'setPolicy', autoPay: true }).ok).toBe(true);
    const founder = Object.values(s.staff)[0]!;
    const st = { ...founder, id: 'sx', role: 'designer' as const, skills: { ...founder.skills }, assignment: { kind: 'idle' as const } };
    s.staff.sx = st;
    st.salary = Math.round(marketSalary(s, st.skills) * 0.5);
    const founderPay = founder.salary;
    staffAutomationWeekly(s);
    expect(st.salary).toBe(Math.round(marketSalary(s, st.skills)));
    expect(founder.salary).toBe(founderPay);
  });
});
