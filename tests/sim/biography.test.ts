import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { biography } from '../../src/ui/game/biography';

describe('studio biography', () => {
  it('tells a sensible story at any point in a run', () => {
    const s = createGame({ seed: 2, companyName: 'Story Co', founderName: 'Ada Founder', startYear: 1990, autopause: false });
    expect(biography(s).join(' ')).toContain('Story Co was founded in 1990 by Ada Founder');
    s.company.cash = 1e8;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 25 } as never;
    const pl = availablePlatforms(s)[0]!;
    for (const name of ['First Light', 'Second Wind']) {
      dispatch(s, { type: 'startGame', game: { name, genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
      for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    }
    advance(s, 400);
    const text = biography(s).join(' ');
    expect(text).toContain('First Light');
    expect(text).not.toMatch(/undefined|NaN/);
    expect(biography(s).length).toBeGreaterThanOrEqual(3);
  });
});
