import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { toDay } from '../../src/sim/calendar';
import { ACADEMY_REP, academyBudget } from '../../src/sim/systems/academy';

function studio(rep = 70) {
  const s = createGame({ seed: 11, companyName: 'Bright Forge', founderName: 'T', startYear: 1992, autopause: false });
  s.company.cash = 1e9;
  s.company.reputation = rep;
  return s;
}

describe('studio academy', () => {
  it('needs a famous studio and a valid craft', () => {
    const low = studio(ACADEMY_REP - 5);
    expect(dispatch(low, { type: 'foundAcademy', track: 'programmer', funding: 2 }).ok).toBe(false);
    const s = studio();
    expect(dispatch(s, { type: 'foundAcademy', track: 'founder', funding: 2 }).ok).toBe(false);
    expect(dispatch(s, { type: 'foundAcademy', track: 'artist', funding: 4 }).ok).toBe(false);
    expect(dispatch(s, { type: 'foundAcademy', track: 'artist', funding: 2 }).ok).toBe(true);
    expect(dispatch(s, { type: 'foundAcademy', track: 'artist', funding: 2 }).ok).toBe(false); // only one
    expect(s.company.academy?.track).toBe('artist');
  });

  it('pays its budget monthly and graduates a loyal, promising class every June after a full year', () => {
    const s = studio();
    expect(dispatch(s, { type: 'foundAcademy', track: 'programmer', funding: 3 }).ok).toBe(true);
    const since = s.company.academy!.since;
    // the first June is too soon if founded in spring (opening in January 1992 → first class June 1993)
    advance(s, toDay(1992, 6, 3) - s.day);
    const firstJune = s.candidates.filter((c) => c.academy);
    if (toDay(1992, 6, 1) - since < 240) expect(firstJune.length).toBe(0);
    advance(s, toDay(1993, 6, 3) - s.day);
    const grads = s.candidates.filter((c) => c.academy === 1993);
    expect(grads.length).toBeGreaterThanOrEqual(3);
    expect(grads.filter((c) => c.role === 'programmer').length).toBeGreaterThan(grads.length / 2);
    for (const g of grads) {
      expect(g.potential).toBeGreaterThanOrEqual(g.skills[g.role === 'programmer' ? 'programming' : 'design'] ?? 0);
      expect(g.expiresDay).toBeGreaterThan(s.day + 60);
    }
    expect(s.company.academy!.grads).toBe(grads.length);
    expect(s.progress.stats.academyGrads).toBe(grads.length);
    // the budget shows up in the training ledger
    const month = s.finance.ledger[s.finance.ledger.length - 2]!;
    expect(month.expense.training ?? 0).toBeGreaterThanOrEqual(academyBudget(s, 3) * 0.9);
    // hiring one: loyal, counted, keeps the badge
    s.office.items.push({ id: 'dx', item: 'desk_basic', floor: 0, x: 1, y: 3, rot: 0 });
    const g = grads[0]!;
    const r = dispatch(s, { type: 'hire', candidateId: g.id });
    expect(r.ok).toBe(true);
    const hired = Object.values(s.staff).find((x) => x.academy === 1993)!;
    expect(hired).toBeDefined();
    expect(hired.loyalty).toBeGreaterThanOrEqual(65);
    expect(s.company.academy!.hired).toBe(1);
  });

  it('can change course and close', () => {
    const s = studio();
    dispatch(s, { type: 'foundAcademy', track: 'mixed', funding: 1 });
    expect(dispatch(s, { type: 'setAcademy', track: 'writer', funding: 3 }).ok).toBe(true);
    expect(s.company.academy).toMatchObject({ track: 'writer', funding: 3 });
    expect(dispatch(s, { type: 'setAcademy', track: 'nope' }).ok).toBe(false);
    expect(dispatch(s, { type: 'closeAcademy' }).ok).toBe(true);
    expect(s.company.academy).toBeUndefined();
    expect(dispatch(s, { type: 'closeAcademy' }).ok).toBe(false);
  });
});
