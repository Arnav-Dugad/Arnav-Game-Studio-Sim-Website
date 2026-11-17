import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { toDay } from '../../src/sim/calendar';
import type { Staff } from '../../src/sim/types';

describe('Studio Awards', () => {
  it('each December crowns an MVP (and others) who keep the honour', () => {
    const s = createGame({ seed: 7, companyName: 'Test', founderName: 'T', startYear: 2000, autopause: false });
    s.company.cash = 1e9;
    const f = s.staff['founder']!;
    for (let i = 0; i < 6; i++) s.staff[`x${i}`] = { ...structuredClone(f), id: `x${i}`, name: `Person ${i}`, role: 'programmer', assignment: { kind: 'research' }, deskId: undefined, hiredDay: toDay(2000, 3, 1), contributed: i * 100 } as Staff;
    advance(s, toDay(2000, 12, 2) - s.day);
    const sa = s.studioAwards?.[0];
    expect(sa?.year).toBe(2000);
    const mvp = sa!.winners.find((w) => w.category === 'MVP')!;
    expect(mvp).toBeDefined();
    expect(s.staff[mvp.id]!.honours).toContain('MVP 2000');
    expect(sa!.winners.some((w) => w.category === 'Rookie of the Year')).toBe(true);
  });
});
