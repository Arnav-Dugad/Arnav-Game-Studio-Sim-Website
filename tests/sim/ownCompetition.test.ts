import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { availablePlatforms } from '../../src/sim/systems/market';
import { salesPotential } from '../../src/sim/systems/release';
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
