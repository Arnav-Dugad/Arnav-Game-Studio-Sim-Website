import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';

describe('shadow drops', () => {
  it('an unannounced game released after 2015 is a shadow drop; announced ones are not', () => {
    const play = (announce: boolean) => {
      const s = createGame({ seed: 3, companyName: 'T', founderName: 'T', startYear: 2016, autopause: false });
      s.company.cash = 1e8;
      s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 20 } as never;
      dispatch(s, { type: 'startGame', game: { name: 'Drop', genre: 'action', topic: 'space', platforms: [availablePlatforms(s)[0]!.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
      if (announce) dispatch(s, { type: 'announce', projectId: Object.keys(s.projects)[0]! });
      for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
      return Object.values(s.releases)[0]!;
    };
    expect(play(false).shadowDrop).toBe(true);
    expect(play(true).shadowDrop).toBeUndefined();
  });
});
