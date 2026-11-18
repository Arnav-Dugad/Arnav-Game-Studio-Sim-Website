import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { GENRE_BY_ID } from '../../src/data/genres';
import { designShare, idealFocus, tunedFocus } from '../../src/ui/game/lib';

describe('Use my notes', () => {
  it('tunes the genre notes so this team lands the design/tech balance', () => {
    const s = createGame({ seed: 4, companyName: 'T', founderName: 'T', startYear: 1990, autopause: false });
    const team = Object.values(s.staff);
    // a programming-heavy founder making a design-heavy genre
    for (const st of team) {
      st.skills.programming = 80;
      st.skills.design = 20;
      st.skills.writing = 15;
      st.skills.art = 20;
    }
    for (const genre of ['adventure', 'action', 'strategy'] as const) {
      const want = GENRE_BY_ID[genre].designRatio;
      const raw = Math.abs(designShare(team, idealFocus(genre))! - want);
      const tuned = tunedFocus(genre, team);
      for (const f of tuned) expect(f[0] + f[1] + f[2]).toBe(100);
      expect(Math.abs(designShare(team, tuned)! - want)).toBeLessThanOrEqual(raw + 1e-9);
    }
  });
});
