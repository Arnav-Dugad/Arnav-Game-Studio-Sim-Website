import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { genreRecord, knownFor, renownSalesMul, renownUserEffect } from '../../src/sim/systems/renown';
import type { GameState, Release } from '../../src/sim/types';

function fake(s: GameState, id: string, genre: Release['concept']['genre'], score: number, extra: Partial<Release['concept']> = {}) {
  s.releases[id] = { id, name: id, score, concept: { genre, topic: 'fantasy', ...extra } } as unknown as Release;
  s.releaseOrder.push(id);
}

describe('genre renown', () => {
  it('two great games in a genre make the studio known for it', () => {
    const s = createGame({ seed: 1, companyName: 'R', founderName: 'R', startYear: 1990, autopause: false });
    fake(s, 'a', 'rpg', 82);
    expect(knownFor(s)).toHaveLength(0);
    fake(s, 'b', 'rpg', 86);
    expect(knownFor(s).map((k) => k.genre)).toEqual(['rpg']);
    expect(renownSalesMul(s, 'rpg')).toBeGreaterThan(1);
    expect(renownSalesMul(s, 'rpg')).toBeLessThanOrEqual(1.12);
    expect(renownSalesMul(s, 'action')).toBe(1);
  });

  it('expansions and remasters do not count, and a weak record is not renown', () => {
    const s = createGame({ seed: 1, companyName: 'R', founderName: 'R', startYear: 1990, autopause: false });
    fake(s, 'a', 'rpg', 90);
    fake(s, 'x', 'rpg', 90, { expansionOf: 'a' });
    fake(s, 'y', 'rpg', 90, { remasterOf: 'a' });
    expect(genreRecord(s, 'rpg').n).toBe(1);
    fake(s, 'b', 'rpg', 55);
    expect(knownFor(s)).toHaveLength(0);
  });

  it('players expect the usual standard from a specialist', () => {
    const s = createGame({ seed: 1, companyName: 'R', founderName: 'R', startYear: 1990, autopause: false });
    fake(s, 'a', 'rpg', 88);
    fake(s, 'b', 'rpg', 86);
    expect(renownUserEffect(s, 'rpg', 70)).toBeLessThan(0);
    expect(renownUserEffect(s, 'rpg', 84)).toBe(0);
    expect(renownUserEffect(s, 'action', 40)).toBe(0);
  });
});
