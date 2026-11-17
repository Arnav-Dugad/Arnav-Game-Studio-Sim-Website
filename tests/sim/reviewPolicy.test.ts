import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { GameProject } from '../../src/sim/types';

function launch(policy?: 'early' | 'launch' | 'none') {
  const s = createGame({ seed: 4, companyName: 'T', founderName: 'T', startYear: 2000, autopause: false });
  s.company.cash = 1e8;
  s.cheats = { ...(s.cheats ?? {}), workMul: 5, scoreBonus: 30 } as never;
  dispatch(s, { type: 'startGame', game: { name: 'Rev', genre: 'action', topic: 'space', platforms: [availablePlatforms(s)[0]!.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  const p = Object.values(s.projects)[0] as GameProject;
  expect(dispatch(s, { type: 'setReviewPolicy', projectId: p.id, policy: 'early' }).ok).toBe(false); // not before polish
  while (s.projects[p.id] && p.phase < 2) advance(s, 1);
  if (policy) expect(dispatch(s, { type: 'setReviewPolicy', projectId: p.id, policy }).ok).toBe(true);
  for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
  const r = Object.values(s.releases)[0]!;
  return r.platforms.reduce((t, x) => t + x.potential, 0);
}

describe('review policy', () => {
  it('a great game sells more with early reviews', () => {
    expect(launch('early')).toBeGreaterThan(launch() * 1.03);
  });
});
