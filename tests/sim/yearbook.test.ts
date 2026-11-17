import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { YEARBOOK_FACES } from '../../src/sim/systems/yearbook';
import type { Staff } from '../../src/sim/types';

describe('yearbook', () => {
  it('takes one photo each New Year, founder in front, capped faces', () => {
    const s = createGame({ seed: 9, companyName: 'Test', founderName: 'T', startYear: 1990, autopause: false });
    s.company.cash = 1e9;
    const f = s.staff['founder']!;
    for (let i = 0; i < 25; i++) s.staff[`x${i}`] = { ...structuredClone(f), id: `x${i}`, name: `P ${i}`, role: 'artist', hiredDay: s.day + i, deskId: undefined, assignment: { kind: 'idle' } } as Staff;
    advance(s, 365 * 3 + 5);
    const book = s.yearbook ?? [];
    expect(book.map((p) => p.year)).toEqual([1990, 1991, 1992]);
    for (const p of book) {
      expect(p.faces.length).toBeLessThanOrEqual(YEARBOOK_FACES);
      expect(p.faces[0]!.role).toBe('founder');
      expect(p.people).toBeGreaterThanOrEqual(p.faces.length);
    }
  });
});
