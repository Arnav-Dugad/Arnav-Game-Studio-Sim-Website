import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng } from '../../src/sim/rng';
import { refreshCandidates, rememberLeaver, removeStaff } from '../../src/sim/systems/staff';
import type { GameState } from '../../src/sim/types';

function studio() {
  const s = createGame({ seed: 41, companyName: 'Home Co', founderName: 'Ada Founder', startYear: 1995, autopause: false });
  s.company.cash = 1e8;
  const f = s.staff['founder']!;
  s.staff['p1'] = { ...structuredClone(f), id: 'p1', name: 'Robin Return', role: 'programmer', level: 'mid', potential: 90, skills: { ...f.skills, programming: 55 }, salary: 30_000, assignment: { kind: 'idle' }, deskId: undefined };
  return s;
}

describe('former colleagues', () => {
  it('someone who left on good terms can come back years later — better, and loyal', () => {
    const s = studio();
    rememberLeaver(s, s.staff['p1']!, 'they moved away');
    removeStaff(s, 'p1');
    expect(s.formerStaff).toHaveLength(1);
    s.day += 365 * 3;
    const c = { s, rng: new Rng(s.rng), out: [] as never[] } as { s: GameState; rng: Rng; out: never[] };
    for (let i = 0; i < 80 && !s.candidates.some((x) => x.returning); i++) {
      s.candidates = [];
      refreshCandidates(c as never);
    }
    const back = s.candidates.find((x) => x.returning)!;
    expect(back).toBeDefined();
    expect(back.name).toBe('Robin Return');
    expect(back.skills.programming).toBeGreaterThan(55);
    expect(back.skills.programming).toBeLessThanOrEqual(90);
    expect(s.formerStaff![0]!.offered).toBe(true);
    expect(dispatch(s, { type: 'hire', candidateId: back.id }).ok).toBe(true);
    const hired = Object.values(s.staff).find((x) => x.name === 'Robin Return')!;
    expect(hired.loyalty).toBeGreaterThanOrEqual(70);
    // only one homecoming each
    s.candidates = [];
    for (let i = 0; i < 40; i++) refreshCandidates(c as never);
    expect(s.candidates.filter((x) => x.returning)).toHaveLength(0);
  });

  it('nobody comes back within a year', () => {
    const s = studio();
    rememberLeaver(s, s.staff['p1']!, 'they moved away');
    removeStaff(s, 'p1');
    s.day += 200;
    const c = { s, rng: new Rng(s.rng), out: [] };
    for (let i = 0; i < 40; i++) {
      s.candidates = [];
      refreshCandidates(c as never);
    }
    expect(s.candidates.some((x) => x.returning)).toBe(false);
  });
});
