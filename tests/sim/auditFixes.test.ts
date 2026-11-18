import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { advance } from '../../src/sim/advance';
import { toDay } from '../../src/sim/calendar';
import { RESEARCH } from '../../src/data/research';
import { valuation } from '../../src/sim/systems/finance';
import { realRepText, refund, repGain } from '../../src/sim/util';
import { marketSalary } from '../../src/sim/systems/staff';
import { acquisitionPrice, adoptableIpValue } from '../../src/sim/systems/rivals';
import type { GameProject, GameState } from '../../src/sim/types';

function studio(year = 2000, seed = 5): GameState {
  const s = createGame({ seed, companyName: 'Audit', founderName: 'A', startYear: year, autopause: false });
  s.company.cash = 50_000_000;
  return s;
}

function startSmall(s: GameState, extra: Record<string, unknown> = {}) {
  return dispatch(s, { type: 'startGame', game: { name: 'Test', genre: 'action', topic: 'scifi', platforms: [Object.keys(s.market.users)[0]!], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team: Object.keys(s.staff), ...extra } as never });
}

describe('stock market can’t print money', () => {
  it('one follow-on offering every six months, and buybacks retire shares', () => {
    const s = studio();
    s.finance.stock = { ipoDay: s.day, ipoPrice: 10, price: 10, shares: 10_000_000, founderShares: 7_000_000, history: [], boardMood: 60, expectation: 0, dividendsPaid: 0 };
    const cash0 = s.company.cash;
    expect(dispatch(s, { type: 'secondaryOffering', pct: 0.2 }).ok).toBe(true);
    expect(dispatch(s, { type: 'secondaryOffering', pct: 0.2 }).ok).toBe(false); // same day: refused
    const raised = s.company.cash - cash0;
    expect(raised).toBeLessThan(10 * 10_000_000 * 0.2); // at most the shares sold, at market price
    const st = s.finance.stock!;
    const shares0 = st.shares;
    expect(dispatch(s, { type: 'buyback', shares: 1_000_000 }).ok).toBe(true);
    expect(st.shares).toBe(shares0 - 1_000_000); // retired, not handed to the founder
    expect(st.founderShares).toBe(7_000_000);
    advance(s, 200);
    expect(dispatch(s, { type: 'secondaryOffering', pct: 0.05 }).ok).toBe(true); // six months on: fine
  });
});

describe('asset sales are not revenue', () => {
  it('selling a franchise doesn’t inflate valuation', () => {
    const s = studio();
    s.franchises.fx = { id: 'fx', name: 'Big Series', genre: 'action', topic: 'scifi', fans: 2_000_000, entries: [], fatigue: 0, lastDay: s.day, bestScore: 90 };
    advance(s, 40);
    const v0 = valuation(s);
    expect(dispatch(s, { type: 'sellFranchise', franchiseId: 'fx' }).ok).toBe(true);
    advance(s, 40);
    const v1 = valuation(s);
    // the cash is real, but the studio isn't suddenly 13x more valuable
    expect(v1).toBeLessThan(v0 + s.company.cash * 2);
  });
});

describe('acquisitions price in the IP', () => {
  it('a famous studio costs at least what its series would sell for', () => {
    const s = studio(2010);
    for (const r of Object.values(s.rivals).filter((x) => x.alive && !x.procedural)) {
      const ip = adoptableIpValue(s, r.id);
      expect(acquisitionPrice(s, r)).toBeGreaterThanOrEqual(ip);
    }
  });
});

describe('development input validation', () => {
  it('rejects malformed focus and concepts instead of corrupting the save', () => {
    const s = studio(1990);
    expect(startSmall(s, { focus: [[1, 1, 1]] }).ok).toBe(false);
    expect(startSmall(s, { size: 'huge' }).ok).toBe(false);
    expect(startSmall(s, { monetization: 'bogus' }).ok).toBe(false);
    const focus: [number, number, number][] = [
      [40, 30, 30],
      [40, 30, 30],
      [40, 30, 30],
    ];
    expect(startSmall(s, { focus }).ok).toBe(true);
    const p = Object.values(s.projects).find((x): x is GameProject => x.kind === 'game')!;
    expect(dispatch(s, { type: 'setFocus', projectId: p.id, phase: 1, focus: [NaN, 50, 50] as never }).ok).toBe(false);
    expect(dispatch(s, { type: 'setFocus', projectId: p.id, phase: 7 as never, focus: [40, 30, 30] }).ok).toBe(false);
    expect(dispatch(s, { type: 'setFocus', projectId: p.id, phase: 1, focus: [80, 10, 10] }).ok).toBe(true);
    expect(focus[1]).toEqual([40, 30, 30]); // the caller's arrays are never written to
    expect(dispatch(s, { type: 'setTeam', projectId: p.id, team: [] }).ok).toBe(false);
  });
});

describe('people', () => {
  it('raises can’t be farmed by cutting and restoring pay; pay has a floor', () => {
    const s = studio(1995);
    const f = Object.values(s.staff)[0]!;
    s.staff.sx = { ...f, id: 'sx', role: 'designer', skills: { ...f.skills }, assignment: { kind: 'idle' } };
    const st = s.staff.sx!;
    st.salary = Math.round(marketSalary(s, st.skills));
    st.loyalty = 40;
    const base = st.salary;
    expect(dispatch(s, { type: 'setSalary', staffId: 'sx', salary: base * 1.25 }).ok).toBe(true);
    const afterFirst = st.loyalty;
    for (let i = 0; i < 6; i++) {
      dispatch(s, { type: 'setSalary', staffId: 'sx', salary: base });
      dispatch(s, { type: 'setSalary', staffId: 'sx', salary: base * 1.25 });
    }
    expect(st.loyalty).toBeLessThanOrEqual(afterFirst);
    expect(dispatch(s, { type: 'setSalary', staffId: 'sx', salary: 1000 }).ok).toBe(false);
  });

  it('letting one person go in bulk isn’t a studio-wide layoff', () => {
    const s = studio(1995);
    const f = Object.values(s.staff)[0]!;
    s.staff.sy = { ...f, id: 'sy', role: 'artist', skills: { ...f.skills }, assignment: { kind: 'idle' } };
    expect(dispatch(s, { type: 'fireMany', staffIds: ['sy'] }).ok).toBe(true);
    expect(s.company.lastLayoffDay).toBeUndefined();
  });
});

describe('review follow-ups', () => {
  it('previews show the reputation a studio would really gain', () => {
    const s = studio();
    s.company.reputation = 40;
    expect(realRepText(s, 'Reputation +2, fans +5%')).toBe('Reputation +2, fans +5%');
    s.company.reputation = 80;
    expect(repGain(s, 2)).toBeCloseTo(0.5, 5);
    expect(realRepText(s, 'Reputation +2, fans +5%')).toBe('Reputation +0.5, fans +5%');
    expect(repGain(s, -3)).toBe(-3); // losses are never softened
  });

  it('a raise is never refused, even for someone paid far under market', () => {
    const s = studio(1995);
    const f = Object.values(s.staff)[0]!;
    s.staff.sz = { ...f, id: 'sz', role: 'designer', skills: { ...f.skills }, assignment: { kind: 'idle' } };
    const st = s.staff.sz!;
    st.salary = Math.round(marketSalary(s, st.skills) * 0.3);
    expect(dispatch(s, { type: 'setSalary', staffId: 'sz', salary: st.salary * 1.1 }).ok).toBe(true);
  });

  it('cancelling long after an advance came in leaves recent revenue alone', () => {
    const s = studio(1995);
    s.finance.revenue12m = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    refund(s, 'advances', 50, s.day - 600); // booked 20 months ago: outside the trailing year
    expect(s.finance.revenue12m.every((v) => v === 100)).toBe(true);
  });
});

describe('second audit round', () => {
  it('ids and kinds that every object answers to are refused (free-text names are fine)', () => {
    const s = studio(1995);
    expect(dispatch(s, { type: 'research', id: 'constructor' }).ok).toBe(false);
    expect(dispatch(s, { type: 'startRnd', id: 'toString' } as never).ok).toBe(false);
    expect(dispatch(s, { type: 'mediaDeal', franchiseId: 'x', kind: 'constructor', control: 'involved' } as never).ok).toBe(false);
    expect(startSmall(s, { name: 'constructor' }).ok).toBe(true); // a game may be called anything
    expect(s.research.active).not.toBe('constructor');
  });

  it('a queued item whose prerequisite was cancelled is dropped and refunded', () => {
    const s = studio(1980);
    s.day = toDay(1990, 1, 1); // a studio that never researched save games
    s.company.cash = 1e6;
    dispatch(s, { type: 'assign', staffId: Object.keys(s.staff)[0]!, to: 'research' });
    expect(dispatch(s, { type: 'research', id: 'sys_save' }).ok).toBe(true);
    expect(dispatch(s, { type: 'queueResearch', id: 'sys_dialogue' }).ok).toBe(true);
    expect(dispatch(s, { type: 'cancelResearch' }).ok).toBe(true);
    const cash = s.company.cash;
    advance(s, 3);
    expect(s.research.queue).not.toContain('sys_dialogue');
    expect(s.company.cash).toBeGreaterThan(cash);
  });
});

describe('regression review fixes', () => {
  it('a queue whose items share an ancestor keeps every item', () => {
    const s = studio(1980);
    s.day = toDay(2000, 1, 1);
    const chain = ['gfx_3d_1', 'gfx_3d_2', 'sys_physics', 'sys_open_world'];
    s.research.done = RESEARCH.map((r) => r.id).filter((x) => !chain.includes(x)); // everything else already known
    s.research.active = null;
    s.research.queue = ['gfx_3d_1', 'gfx_3d_2', 'sys_physics', 'sys_open_world'];
    advance(s, 1);
    expect(s.research.queue).toContain('sys_open_world');
  });

  it('a perk that was on at the start of the month is billed even if switched off before the next', () => {
    const s = studio(1995);
    dispatch(s, { type: 'setPolicy', salaryPolicy: 'generous' });
    advance(s, toDay(1995, 3, 2) - s.day); // through a month's bill with it on
    dispatch(s, { type: 'setPolicy', salaryPolicy: 'market' });
    const before = s.finance.ledger.length;
    advance(s, toDay(1995, 4, 2) - s.day);
    const bill = s.finance.ledger[before]!; // the month that started with generous pay
    expect(bill.expense.salaries ?? 0).toBeGreaterThan(0);
    // the 8% is there: more than the base payroll alone
    const base = Object.values(s.staff).reduce((t, x) => t + x.salary / 12, 0);
    expect(bill.expense.salaries!).toBeGreaterThan(base * 1.05);
  });

  it('single firings spread over months never add up to a layoff', () => {
    const s = studio(1995);
    const f = Object.values(s.staff)[0]!;
    for (let i = 0; i < 4; i++) {
      s.staff[`f${i}`] = { ...f, id: `f${i}`, role: 'artist', skills: { ...f.skills }, assignment: { kind: 'idle' } };
    }
    for (let i = 0; i < 4; i++) {
      expect(dispatch(s, { type: 'fire', staffId: `f${i}` }).ok).toBe(true);
      advance(s, 29);
    }
    expect(s.company.lastLayoffDay).toBeUndefined();
  });
});
