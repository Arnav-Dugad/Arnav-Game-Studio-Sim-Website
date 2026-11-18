import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { RESEARCH } from '../../src/data/research';
import { researchAvailable } from '../../src/sim/systems/research';
import type { GameState, Staff } from '../../src/sim/types';

function studio(year = 1990, seed = 7): GameState {
  const s = createGame({
    seed,
    companyName: 'Audit Two',
    founderName: 'A',
    startYear: year,
    autopause: false,
  });
  s.company.cash = 50_000_000;
  return s;
}

describe('research refunds give back what was paid', () => {
  it('stopping a project years later returns half of its original price, not half of today’s', () => {
    const s = studio();
    const def = RESEARCH.find((r) => researchAvailable(s, r).ok)!;
    const cash0 = s.company.cash;
    expect(dispatch(s, { type: 'research', id: def.id }).ok).toBe(true);
    const paid = cash0 - s.company.cash;
    s.day += 365 * 20; // decades of inflation later
    const before = s.company.cash;
    expect(dispatch(s, { type: 'cancelResearch' }).ok).toBe(true);
    expect(s.company.cash - before).toBe(Math.round(paid * 0.5));
    expect(s.research.paid?.[def.id]).toBeUndefined();
  });
});

describe('takeover defence', () => {
  it('never leaves the founder with more shares than exist', () => {
    const s = studio(2000);
    s.finance.stock = {
      ipoDay: s.day,
      ipoPrice: 10,
      price: 10,
      shares: 4_000_000,
      founderShares: 4_000_000,
      history: [],
      boardMood: 60,
      expectation: 0,
      dividendsPaid: 0,
    };
    s.pendingEvents.push({
      uid: 991,
      defId: 'hostile_takeover',
      day: s.day,
      title: 'Takeover',
      body: '',
      art: '',
      expiresDay: s.day + 30,
      ctx: { defend: 1000, toBuy: 1_200_000, rival: '' },
      options: [{ id: 'defend', label: 'Defend', cost: 1000 } as never],
    });
    expect(dispatch(s, { type: 'resolveEvent', uid: 991, option: 'defend' }).ok).toBe(true);
    expect(s.finance.stock!.founderShares).toBeLessThanOrEqual(s.finance.stock!.shares);
  });
});

describe('layoffs', () => {
  it('three people let go within any 30 days count as a layoff', () => {
    const s = studio(2000);
    const f = Object.values(s.staff)[0]!;
    const hire = (i: number): string => {
      const id = `x${i}`;
      s.staff[id] = {
        ...(JSON.parse(JSON.stringify(f)) as Staff),
        id,
        role: 'programmer',
        intern: undefined,
        assignment: { kind: 'idle' },
      };
      return id;
    };
    const day0 = s.day;
    expect(dispatch(s, { type: 'fire', staffId: hire(1) }).ok).toBe(true);
    s.day = day0 + 30;
    dispatch(s, { type: 'fire', staffId: hire(2) });
    s.day = day0 + 31;
    expect(s.company.lastLayoffDay).toBeUndefined();
    dispatch(s, { type: 'fire', staffId: hire(3) });
    dispatch(s, { type: 'fire', staffId: hire(4) });
    expect(s.company.lastLayoffDay).toBe(day0 + 31); // three in two days
  });
});
