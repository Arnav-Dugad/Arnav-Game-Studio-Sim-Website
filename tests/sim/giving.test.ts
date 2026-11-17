import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { toDay } from '../../src/sim/calendar';
import { earn } from '../../src/sim/util';

describe('giving back', () => {
  it('a pledge donates a share of last month’s profit, even if switched off before the 1st', () => {
    const s = createGame({ seed: 5, companyName: 'Test', founderName: 'T', startYear: 2000, autopause: false });
    advance(s, toDay(2000, 2, 2) - s.day);
    expect(dispatch(s, { type: 'setPolicy', charity: 5 }).ok).toBe(true);
    expect(dispatch(s, { type: 'setPolicy', charity: 3 as never }).ok).toBe(false);
    earn(s, 'other_income', 1_000_000);
    dispatch(s, { type: 'setPolicy', charity: 0 }); // too late: this month's pledge stands
    advance(s, toDay(2000, 3, 2) - s.day);
    expect(s.progress.stats.donated ?? 0).toBeGreaterThan(30_000);
  });

  it('old engines can be open-sourced once', () => {
    const s = createGame({ seed: 5, companyName: 'Test', founderName: 'T', startYear: 2000, autopause: false });
    s.engines['e9'] = { id: 'e9', name: 'Old', features: [], tech: 3, maturity: 1, gamesShipped: 3, builtDay: s.day - 365 * 10, royalty: 0, licensees: 2 };
    const rep = s.company.reputation;
    expect(dispatch(s, { type: 'openSourceEngine', engineId: 'e9' }).ok).toBe(true);
    expect(s.engines['e9']!.openSourced).toBe(true);
    expect(s.engines['e9']!.licensees).toBe(0);
    expect(s.company.reputation).toBeGreaterThan(rep);
    expect(dispatch(s, { type: 'openSourceEngine', engineId: 'e9' }).ok).toBe(false);
    expect(dispatch(s, { type: 'openSourceEngine', engineId: 'e0' }).ok).toBe(false);
  });
});

describe('review fixes', () => {
  it('pledge morale needs three unbroken months; sending an intern home is not a layoff', async () => {
    const { moraleTarget } = await import('../../src/sim/systems/staff');
    const s = createGame({ seed: 5, companyName: 'Test', founderName: 'T', startYear: 2000, autopause: false });
    const f = s.staff['founder']!;
    dispatch(s, { type: 'setPolicy', charity: 5 });
    expect(moraleTarget(s, f).parts.some((p) => p.label === 'Giving back')).toBe(false);
    s.day += 95;
    expect(moraleTarget(s, f).parts.some((p) => p.label === 'Giving back')).toBe(true);
    dispatch(s, { type: 'setPolicy', charity: 1 });
    expect(moraleTarget(s, f).parts.some((p) => p.label === 'Giving back')).toBe(false);
    s.staff['i1'] = { ...structuredClone(f), id: 'i1', name: 'Ira Intern', role: 'artist', intern: { until: s.day + 30 }, deskId: undefined };
    const cash = s.company.cash;
    expect(dispatch(s, { type: 'fire', staffId: 'i1' }).ok).toBe(true);
    expect(s.company.cash).toBe(cash);
    expect(s.company.lastLayoffDay).toBeUndefined();
  });
});
