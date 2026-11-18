import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { toDay } from '../../src/sim/calendar';
import { availablePlatforms } from '../../src/sim/systems/market';
import { conceptLaunchPrice, salesPotential } from '../../src/sim/systems/release';
import type { GameProject, Release } from '../../src/sim/types';

describe('your own recent games compete for players', () => {
  it('only on the machines they share, and a small game less than a big one', () => {
    const s = createGame({ seed: 8, companyName: 'Own Co', founderName: 'O', startYear: 2005, autopause: false });
    const plats = availablePlatforms(s);
    const pc = plats.find((p) => p.kind === 'computer')!;
    const other = plats.find((p) => p.kind === 'console')!;
    const concept = { name: 'New', genre: 'action', topic: 'space', platforms: [pc.id, other.id], audience: 'teen', size: 'medium', monetization: 'premium', engineId: 'e0' } as unknown as GameProject['concept'];
    const by = () => Object.fromEntries(salesPotential(s, concept, 80, 0).platforms.map((p) => [p.platform, p.potential]));
    const before = by();
    const old = (id: string, size: string) => {
      s.releases[id] = { id, day: s.day - 10, concept: { platforms: [pc.id], size } } as unknown as Release;
      s.releaseOrder.push(id);
    };
    old('r1', 'small');
    const afterSmall = by();
    expect(afterSmall[other.id]).toBeCloseTo(before[other.id]!, 6); // a PC-only game doesn't touch console sales
    expect(afterSmall[pc.id]!).toBeLessThan(before[pc.id]!);
    old('r2', 'aaa');
    const afterBig = by();
    expect(before[pc.id]! / afterBig[pc.id]! - before[pc.id]! / afterSmall[pc.id]!).toBeGreaterThan(before[pc.id]! / afterSmall[pc.id]! - 1); // the big one weighs more
  });
});

describe('launch price', () => {
  it('is the same whatever order the platforms were picked in', () => {
    const s = createGame({ seed: 9, companyName: 'Price Order', founderName: 'P', startYear: 1995, autopause: false });
    const ps = availablePlatforms(s).slice(0, 2).map((p) => p.id);
    const c = (platforms: string[]) => ({ name: 'X', genre: 'action', topic: 'space', platforms, audience: 'teen', size: 'large', monetization: 'premium', engineId: 'e0' }) as unknown as GameProject['concept'];
    expect(conceptLaunchPrice(s, c(ps))).toBeCloseTo(conceptLaunchPrice(s, c([...ps].reverse())), 9);
  });
});

describe('a machine going off sale', () => {
  it('fades from where it was (never more buyers the day after), and never dilutes a sequel’s fans', () => {
    const s = createGame({ seed: 10, companyName: 'Fade Co', founderName: 'F', startYear: 1995, autopause: false });
    s.day = toDay(1995, 9, 15); // a few weeks after the NES went off sale
    const c = (platforms: string[], franchiseId?: string) => ({ name: 'S', genre: 'platformer', topic: 'fantasy', platforms, audience: 'everyone', size: 'medium', monetization: 'premium', engineId: 'e0', franchiseId }) as unknown as GameProject['concept'];
    const nes = salesPotential(s, c(['nes']), 80, 0).platforms[0]!.potential;
    s.day = toDay(1995, 7, 15); // on sale
    const nesBefore = salesPotential(s, c(['nes']), 80, 0).platforms[0]!.potential;
    expect(nes).toBeLessThanOrEqual(nesBefore);
    s.day = toDay(1995, 9, 15);
    s.franchises.fx = { id: 'fx', name: 'Fx', genre: 'platformer', topic: 'fantasy', fans: 2_000_000, entries: [], fatigue: 0, lastDay: s.day - 400, bestScore: 85 };
    const sum = (pids: string[]) => salesPotential(s, c(pids, 'fx'), 80, 0).platforms.reduce((t, p) => t + p.potential, 0);
    expect(sum(['genesis', 'nes'])).toBeGreaterThanOrEqual(sum(['genesis']));
  });
});
