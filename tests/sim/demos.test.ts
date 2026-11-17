import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { demoReception } from '../../src/sim/systems/demos';
import type { GameProject } from '../../src/sim/types';

function polishing(total: number) {
  const s = createGame({ seed: 43, companyName: 'Demo Co', founderName: 'Ada Founder', startYear: 2000, autopause: false });
  s.company.cash = 1e8;
  const pl = availablePlatforms(s)[0]!;
  dispatch(s, { type: 'startGame', game: { name: 'Try Me', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
  p.qualityPreview = { total, parts: [] };
  return { s, p };
}

describe('public demos', () => {
  it('needs an announced game in polish, and happens once', () => {
    const { s, p } = polishing(0.9);
    expect(dispatch(s, { type: 'releaseDemo', projectId: p.id }).ok).toBe(false); // not announced
    dispatch(s, { type: 'announce', projectId: p.id });
    expect(dispatch(s, { type: 'releaseDemo', projectId: p.id }).ok).toBe(false); // not in polish
    p.phase = 2;
    const hype = p.hype;
    expect(dispatch(s, { type: 'releaseDemo', projectId: p.id }).ok).toBe(true);
    expect(p.hype).toBeGreaterThan(hype);
    expect(dispatch(s, { type: 'releaseDemo', projectId: p.id }).ok).toBe(false);
  });

  it('tells the truth: a weak game loses hype', () => {
    expect(demoReception(50).hype).toBeLessThan(0);
    expect(demoReception(80).hype).toBeGreaterThan(0);
    const { s, p } = polishing(0.3);
    dispatch(s, { type: 'announce', projectId: p.id });
    p.phase = 2;
    p.hype = 0.5;
    dispatch(s, { type: 'releaseDemo', projectId: p.id });
    expect(p.hype).toBeLessThan(0.5);
  });
});
