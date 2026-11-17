import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { toDay } from '../../src/sim/calendar';

function studio() {
  const s = createGame({ seed: 6, companyName: 'Test', founderName: 'T', startYear: 1990, autopause: false });
  s.company.cash = 1e8;
  // a couple of spare desks in the garage
  s.office.items.push({ id: 'd8', item: 'desk_basic', floor: 0, x: 1, y: 3, rot: 0 }, { id: 'd9', item: 'desk_basic', floor: 0, x: 4, y: 3, rot: 0 });
  return s;
}

describe('summer internships', () => {
  it('interns arrive in June, learn, and leave in September unless you hire the star', () => {
    const s = studio();
    expect(dispatch(s, { type: 'setPolicy', interns: true }).ok).toBe(true);
    advance(s, toDay(1990, 6, 2) - s.day);
    const interns = Object.values(s.staff).filter((x) => x.intern);
    expect(interns.length).toBeGreaterThan(0);
    expect(interns.every((x) => x.level === 'junior' && x.salary > 0)).toBe(true);
    advance(s, toDay(1990, 9, 2) - s.day);
    const left = Object.values(s.staff).filter((x) => x.intern);
    expect(left.length).toBeLessThanOrEqual(1); // only the star, waiting for an offer
    const ev = s.pendingEvents.find((e) => e.defId === 'intern_offer');
    expect(ev).toBeDefined();
    expect(dispatch(s, { type: 'resolveEvent', uid: ev!.uid, option: 'hire' }).ok).toBe(true);
    const hired = Object.values(s.staff).find((x) => x.wasIntern)!;
    expect(hired).toBeDefined();
    expect(hired.intern).toBeUndefined();
    expect(s.progress.stats.internsHired).toBe(1);
  });

  it('nothing happens without the policy', () => {
    const s = studio();
    advance(s, toDay(1990, 7, 1) - s.day);
    expect(Object.values(s.staff).some((x) => x.intern)).toBe(false);
  });
});
