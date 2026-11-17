import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { BONUS_WINDOW_DAYS } from '../../src/sim/systems/launchBonus';
import type { Release } from '../../src/sim/types';

function world() {
  const s = createGame({ seed: 26, companyName: 'Thanks Co', founderName: 'Ada Founder', startYear: 2000, autopause: false });
  s.company.cash = 1e8;
  const f = s.staff['founder']!;
  s.staff['a1'] = { ...structuredClone(f), id: 'a1', name: 'Ali Artist', role: 'artist', assignment: { kind: 'idle' }, deskId: undefined, mood: undefined, loyalty: 50 };
  const r = { id: 'r1', name: 'Shipped It', day: s.day, score: 80, credits: [{ id: 'founder', name: 'Ada', role: 'founder', level: 'mid' }, { id: 'a1', name: 'Ali Artist', role: 'artist', level: 'mid' }] } as unknown as Release;
  s.releases[r.id] = r;
  s.releaseOrder.push(r.id);
  return { s, r };
}

describe('launch bonuses', () => {
  it('thank the team once: money for mood and loyalty', () => {
    const { s, r } = world();
    const cash = s.company.cash;
    expect(dispatch(s, { type: 'launchBonus', releaseId: r.id }).ok).toBe(true);
    expect(s.company.cash).toBeLessThan(cash);
    const a = s.staff['a1']!;
    expect(a.loyalty).toBe(54);
    expect(a.mood?.label).toBe('Launch bonus');
    expect(dispatch(s, { type: 'launchBonus', releaseId: r.id }).ok).toBe(false);
  });
  it('only soon after launch', () => {
    const { s, r } = world();
    s.day += BONUS_WINDOW_DAYS + 1;
    expect(dispatch(s, { type: 'launchBonus', releaseId: r.id }).ok).toBe(false);
  });
});
