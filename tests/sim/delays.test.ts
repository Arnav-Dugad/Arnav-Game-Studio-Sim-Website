import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';

function ship(scoreBonus: number, weeks: number) {
  const s = createGame({ seed: 23, companyName: 'Late Co', founderName: 'Ada Founder', startYear: 2000, autopause: false });
  s.company.cash = 1e8;
  s.cheats = { ...(s.cheats ?? {}), workMul: scoreBonus > 0 ? 5 : 0.4, scoreBonus } as never;
  const pl = availablePlatforms(s)[0]!;
  dispatch(s, { type: 'startGame', game: { name: 'Soon', genre: 'action', topic: 'space', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  const p = Object.values(s.projects)[0]!;
  dispatch(s, { type: 'announce', projectId: p.id });
  for (let i = 0; i < weeks; i += 2) dispatch(s, { type: 'delay', projectId: p.id, weeks: 2 });
  for (let i = 0; i < 40 && Object.keys(s.projects).length; i++) advance(s, 30);
  return Object.values(s.releases)[0]!;
}
const labels = (r: ReturnType<typeof ship>) => (r.why.user?.parts ?? []).map((x) => x.label);

describe('public delays', () => {
  it('a great game is worth the wait', () => {
    const r = ship(30, 4);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(labels(r)).toContain('Worth the wait');
  });
  it('a long delay that still disappoints is remembered', () => {
    const r = ship(-30, 6);
    expect(r.score).toBeLessThan(65);
    expect(labels(r)).toContain('Delayed — and still disappointing');
  });
});
