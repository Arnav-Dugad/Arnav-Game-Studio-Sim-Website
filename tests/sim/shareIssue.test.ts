import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { doIPO, valuation } from '@/sim/systems/finance';

describe('issuing shares', () => {
  it('dilutes the founder and never conjures value per share', () => {
    const s = createGame({ seed: 5, companyName: 'Pub', founderName: 'F', startYear: 2000, endless: true, autopause: false, difficulty: 'standard' });
    s.company.cash = 50_000_000;
    doIPO(s, 0.3);
    const st = s.finance.stock!;
    const perShare0 = valuation(s) / st.shares;
    const own0 = st.founderShares / st.shares;
    for (let i = 0; i < 10; i++) dispatch(s, { type: 'secondaryOffering', pct: 0.05 });
    const perShare1 = valuation(s) / st.shares;
    expect(st.founderShares / st.shares).toBeLessThan(own0); // diluted
    expect(perShare1).toBeLessThanOrEqual(perShare0 * 1.001); // sold below the price: a little less per share, never more
    expect(s.company.cash).toBeGreaterThan(50_000_000);
  });

  it('stops before the founder keeps almost nothing', () => {
    const s = createGame({ seed: 6, companyName: 'Pub', founderName: 'F', startYear: 2000, endless: true, autopause: false, difficulty: 'standard' });
    s.company.cash = 50_000_000;
    doIPO(s, 0.3);
    let ok = 0;
    for (let i = 0; i < 200; i++) if (dispatch(s, { type: 'secondaryOffering', pct: 0.2 }).ok) ok++;
    const st = s.finance.stock!;
    expect(st.founderShares / st.shares).toBeGreaterThanOrEqual(0.05);
    expect(ok).toBeLessThan(200);
  });
});
