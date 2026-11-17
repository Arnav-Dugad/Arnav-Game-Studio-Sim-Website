import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch, cliffhangerPending } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { GameProject } from '../../src/sim/types';

describe('cliffhanger endings', () => {
  it('the sequel starts with hype and players love the payoff', () => {
    const s = createGame({ seed: 4, companyName: 'Test', founderName: 'T', startYear: 1995, autopause: false });
    s.company.cash = 1e8;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5 } as never;
    const pl = availablePlatforms(s)[0]!;
    const start = (name: string, franchiseId?: string) => dispatch(s, { type: 'startGame', game: { name, genre: 'rpg', topic: 'fantasy', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'], features: ['cliffhanger'], ...(franchiseId ? { franchiseId } : {}) } });
    expect(start('Saga').ok).toBe(true);
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const first = Object.values(s.releases)[0]!;
    expect(first.why.user!.parts.some((x) => x.label.includes('Cliffhanger'))).toBe(true);
    const fid = first.concept.franchiseId!;
    expect(cliffhangerPending(s, fid)).toBe(true);
    expect(start('Saga 2', fid).ok).toBe(true);
    const p = Object.values(s.projects)[0] as GameProject;
    expect(p.hype).toBeGreaterThanOrEqual(0.6);
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const second = Object.values(s.releases).find((r) => r.name === 'Saga 2')!;
    expect(second.why.user!.parts.some((x) => x.label.startsWith('Pays off'))).toBe(true);
  });

  it('a remaster or expansion can’t carry a cliffhanger', () => {
    const s = createGame({ seed: 4, companyName: 'Test', founderName: 'T', startYear: 1995, autopause: false });
    s.company.cash = 1e8;
    s.cheats = { ...(s.cheats ?? {}), workMul: 5 } as never;
    const pl = availablePlatforms(s)[0]!;
    dispatch(s, { type: 'startGame', game: { name: 'Base', genre: 'rpg', topic: 'fantasy', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    for (let i = 0; i < 20 && Object.keys(s.projects).length; i++) advance(s, 30);
    const base = Object.values(s.releases)[0]!;
    const r = dispatch(s, { type: 'startGame', game: { name: 'Base: More', genre: 'rpg', topic: 'fantasy', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'], franchiseId: base.concept.franchiseId, expansionOf: base.id, features: ['cliffhanger'] } });
    expect(r.ok).toBe(false);
  });
});
