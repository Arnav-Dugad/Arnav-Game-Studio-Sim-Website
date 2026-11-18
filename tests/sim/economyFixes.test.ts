import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { subRefPrice } from '../../src/sim/systems/subscription';
import { plannedLaunchDay } from '../../src/sim/systems/hardware';
import { fromDay } from '../../src/sim/calendar';
import type { GameState } from '../../src/sim/types';

function studio(year = 2015, seed = 31): GameState {
  const s = createGame({ seed, companyName: 'Econ Co', founderName: 'E', startYear: year, autopause: false });
  s.company.cash = 500_000_000;
  return s;
}

describe('game pass pricing', () => {
  it('a price rise never brings in more than the old price did (subscribers cancel at once)', () => {
    const s = studio();
    const ref = subRefPrice(s);
    s.subscription = { name: 'Pass', price: ref, launchedDay: s.day - 400, subscribers: 400_000, peak: 400_000, revenue: 0, history: [], active: true };
    const before = s.subscription.subscribers * s.subscription.price;
    expect(dispatch(s, { type: 'setSubscriptionPrice', price: ref * 3.9 }).ok).toBe(true);
    expect(s.subscription.subscribers * s.subscription.price).toBeLessThanOrEqual(before * 1.001); // (cents and whole subscribers round)
  });
});

describe('own hardware', () => {
  it('launches on the first of a month, the date the design screen shows', () => {
    const d = plannedLaunchDay(10_000, 14);
    expect(fromDay(d).day).toBe(1);
    expect(d).toBeGreaterThanOrEqual(10_000 + Math.round(14 * 30.44));
  });
});
