import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { advance } from '@/sim/advance';
import { dispatch } from '@/sim/actions';
import { doIPO } from '@/sim/systems/finance';
import { fromDay } from '@/sim/calendar';

function publicStudio() {
  const s = createGame({ seed: 5, companyName: 'Pub', founderName: 'F', startYear: 2000, endless: true, autopause: false, difficulty: 'standard' });
  s.company.cash = 50_000_000;
  doIPO(s, 0.3);
  s.cheats = { ...(s.cheats ?? {}), noEvents: true } as typeof s.cheats;
  return s;
}

describe('annual shareholder meeting', () => {
  it('is called every May once the studio has been public for a while', () => {
    const s = publicStudio();
    const seen: number[] = [];
    for (let i = 0; i < 365 * 3; i++) {
      advance(s, 1);
      const agm = s.pendingEvents.find((e) => e.defId === 'agm');
      if (agm) {
        seen.push(fromDay(s.day).month);
        dispatch(s, { type: 'resolveEvent', uid: agm.uid, option: 'steady' });
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every((m) => m === 5)).toBe(true);
  });

  it('a dividend costs cash and lifts the board', () => {
    const s = publicStudio();
    for (let i = 0; i < 365 * 2 && !s.pendingEvents.some((e) => e.defId === 'agm'); i++) {
      advance(s, 1);
      // make last year profitable so a dividend is on the table
      s.finance.ledger.at(-1)!.income.sales = 2_000_000;
    }
    const agm = s.pendingEvents.find((e) => e.defId === 'agm');
    expect(agm).toBeTruthy();
    if (agm!.options.some((o) => o.id === 'dividend' && !o.disabled)) {
      const cash = s.company.cash;
      const mood = s.finance.stock!.boardMood;
      dispatch(s, { type: 'resolveEvent', uid: agm!.uid, option: 'dividend' });
      expect(s.company.cash).toBeLessThan(cash);
      expect(s.finance.stock!.dividendsPaid).toBeGreaterThan(0);
      expect(s.finance.stock!.boardMood).toBeGreaterThan(mood);
    }
  });
});

describe('venture funding', () => {
  it('rounds need reputation and a year apart, and investors sell into the IPO', () => {
    const s = createGame({ seed: 6, companyName: 'VC', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });
    s.company.cash = 2_000_000;
    expect(dispatch(s, { type: 'raiseFunding' }).ok).toBe(false); // reputation
    s.company.reputation = 50;
    const cash = s.company.cash;
    expect(dispatch(s, { type: 'raiseFunding' }).ok).toBe(true);
    expect(s.company.cash).toBeGreaterThan(cash);
    expect(s.company.investorStake).toBeCloseTo(0.15, 6);
    expect(dispatch(s, { type: 'raiseFunding' }).ok).toBe(false); // a year apart
    s.day += 366;
    expect(dispatch(s, { type: 'raiseFunding' }).ok).toBe(true);
    doIPO(s, 0.3);
    const st = s.finance.stock!;
    // investors (30%) sell into the IPO first; the founder keeps the rest
    expect(st.founderShares / st.shares).toBeCloseTo(0.7, 2);
    expect(s.company.investorStake).toBe(0);
  });
});
