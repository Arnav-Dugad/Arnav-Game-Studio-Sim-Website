import { describe, expect, it } from 'vitest';
import { scoreCut } from '../../src/ui/game/trailer';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { GameProject } from '../../src/sim/types';

describe('trailer cut', () => {
  it('rewards a hook, a breath, a build and the title last', () => {
    expect(scoreCut(['explosion', 'quiet', 'montage', 'title'], 'action').points).toBe(8);
    expect(scoreCut(['title', 'joke', 'hero', 'vista'], 'action').points).toBeLessThan(2);
  });
  it('is applied once, after the announcement', () => {
    const s = createGame({ seed: 1, companyName: 'T', founderName: 'T', startYear: 1990, autopause: false });
    dispatch(s, { type: 'startGame', game: { name: 'Tr', genre: 'action', topic: 'space', platforms: [availablePlatforms(s)[0]!.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    const p = Object.values(s.projects)[0] as GameProject;
    expect(dispatch(s, { type: 'trailerCut', projectId: p.id, points: 8 }).ok).toBe(false);
    dispatch(s, { type: 'announce', projectId: p.id });
    const hype = p.hype;
    expect(dispatch(s, { type: 'trailerCut', projectId: p.id, points: 99 }).ok).toBe(true);
    expect(p.hype).toBeCloseTo(hype + 0.4, 5);
    expect(dispatch(s, { type: 'trailerCut', projectId: p.id, points: 8 }).ok).toBe(false);
  });
});
