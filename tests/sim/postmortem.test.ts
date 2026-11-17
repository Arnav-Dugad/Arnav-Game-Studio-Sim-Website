import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { postMortem } from '../../src/ui/game/postmortem';

function ship(workMul: number, scoreBonus: number, topic: string) {
  const s = createGame({ seed: 7, companyName: 'PM Co', founderName: 'Ada Founder', startYear: 1990, autopause: false });
  s.company.cash = 1e8;
  s.cheats = { ...(s.cheats ?? {}), workMul, scoreBonus } as never;
  const pl = availablePlatforms(s)[0]!;
  dispatch(s, { type: 'startGame', game: { name: 'Probe', genre: 'action', topic, platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  for (let i = 0; i < 30 && Object.keys(s.projects).length; i++) advance(s, 30);
  advance(s, 200);
  return Object.values(s.releases)[0]!;
}

describe('post-mortem', () => {
  it('writes a sensible, ranked review of a release', () => {
    const r = ship(5, 20, 'space');
    const pm = postMortem(r);
    expect(pm.verdict.length).toBeGreaterThan(5);
    expect(pm.right.length + pm.wrong.length).toBeGreaterThan(0);
    for (const p of [...pm.right, ...pm.wrong]) {
      expect(p.text).not.toMatch(/undefined|NaN/);
      expect(Number.isFinite(p.weight)).toBe(true);
    }
    // every problem comes with advice, except things that simply happened to players
    for (const p of pm.wrong) if (p.lesson) expect(p.lesson.length).toBeGreaterThan(5);
    for (let i = 1; i < pm.right.length; i++) expect(pm.right[i - 1]!.weight).toBeGreaterThanOrEqual(pm.right[i]!.weight);
    expect(pm.right.length).toBeLessThanOrEqual(4);
    expect(pm.wrong.length).toBeLessThanOrEqual(4);
  });

  it('calls out thin effort and gives advice on a rushed game', () => {
    const r = ship(0.3, 0, 'space');
    const pm = postMortem(r);
    expect(pm.wrong.length).toBeGreaterThan(0);
    expect(pm.wrong.some((p) => p.lesson)).toBe(true);
    expect(pm.tone).not.toBe('good');
  });

  it('does not call a game a money-loser while it is still selling', () => {
    const r = structuredClone(ship(5, 20, 'space'));
    r.active = true;
    r.week = 2;
    r.net = 0;
    r.devCost = 1_000_000;
    const pm = postMortem(r);
    expect(pm.wrong.some((p) => p.text === 'It lost money')).toBe(false);
    expect(pm.verdict).not.toMatch(/pay its way|money-loser|hard lesson/);
    r.active = false;
    expect(postMortem(r).wrong.some((p) => p.text === 'It lost money')).toBe(true);
  });
});
