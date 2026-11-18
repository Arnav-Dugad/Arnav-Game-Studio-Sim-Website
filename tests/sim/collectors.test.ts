import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/create';
import { dispatch } from '../../src/sim/actions';
import { Rng, seedRng } from '../../src/sim/rng';
import { availablePlatforms } from '../../src/sim/systems/market';
import { CE_RUN, ceDemand, collectorsOnRelease } from '../../src/sim/systems/collectors';
import type { GameProject, GameState, Release } from '../../src/sim/types';

function setup(year = 2000): { s: GameState; p: GameProject } {
  const s = createGame({ seed: 5, companyName: 'Box Co', founderName: 'Ada Founder', startYear: year, autopause: false });
  s.company.cash = 1e8;
  const pl = availablePlatforms(s)[0]!;
  dispatch(s, { type: 'startGame', game: { name: 'Big Box', genre: 'rpg', topic: 'fantasy', platforms: [pl.id], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  const p = Object.values(s.projects).find((x) => x.kind === 'game') as GameProject;
  return { s, p };
}

describe("collector's editions", () => {
  it('needs an announced, self-published, full-price game — once', () => {
    const { s, p } = setup();
    expect(dispatch(s, { type: 'orderCollectors', projectId: p.id, run: 'small' }).ok).toBe(false); // not announced
    p.announcedDay = s.day;
    const cash = s.company.cash;
    const spent = p.spent;
    expect(dispatch(s, { type: 'orderCollectors', projectId: p.id, run: 'huge' as never }).ok).toBe(false);
    expect(dispatch(s, { type: 'orderCollectors', projectId: p.id, run: 'medium' }).ok).toBe(true);
    expect(p.spent - spent).toBe(cash - s.company.cash); // the run is part of the game's budget
    expect(s.company.cash).toBeLessThan(cash);
    expect(p.collectors?.run).toBe('medium');
    expect(dispatch(s, { type: 'orderCollectors', projectId: p.id, run: 'small' }).ok).toBe(false);
  });

  it('too early in history, or free-to-play: no', () => {
    const early = setup(1980);
    early.p.announcedDay = early.s.day;
    expect(dispatch(early.s, { type: 'orderCollectors', projectId: early.p.id, run: 'small' }).ok).toBe(false);
    const { s, p } = setup();
    p.announcedDay = s.day;
    p.concept = { ...p.concept, monetization: 'f2p' };
    expect(dispatch(s, { type: 'orderCollectors', projectId: p.id, run: 'small' }).ok).toBe(false);
  });

  it('demand grows with fans, hype and reviews; sales never exceed the run', () => {
    const { s, p } = setup();
    s.company.fans = 1_000_000;
    const lo = ceDemand(s, { concept: p.concept, hype: 0.2 }, 70);
    expect(ceDemand(s, { concept: p.concept, hype: 2 }, 70)).toBeGreaterThan(lo);
    expect(ceDemand(s, { concept: p.concept, hype: 0.2 }, 90)).toBeGreaterThan(lo);
    s.company.fans = 2_000_000;
    expect(ceDemand(s, { concept: p.concept, hype: 0.2 }, 70)).toBeGreaterThan(lo);

    p.collectors = { run: 'small', cost: 1 };
    const rel = { name: 'Big Box', score: 92, price: 50, concept: { engineId: 'e0' }, hypeAtLaunch: 3, net: 0, gross: 0, units: 0 } as unknown as Release;
    const cash = s.company.cash;
    collectorsOnRelease({ s, rng: new Rng(seedRng(1)), out: [] }, p, rel);
    expect(rel.collectors!.sold).toBe(CE_RUN.small); // a sell-out
    expect(rel.collectors!.price).toBe(125);
    expect(s.company.cash).toBeGreaterThan(cash);

    const { s: s2, p: p2 } = setup();
    s2.company.fans = 1000;
    p2.collectors = { run: 'large', cost: 1 };
    const flop = { name: 'Big Box', score: 50, price: 50, concept: { engineId: 'e0' }, hypeAtLaunch: 0, net: 0, gross: 0, units: 0 } as unknown as Release;
    collectorsOnRelease({ s: s2, rng: new Rng(seedRng(1)), out: [] }, p2, flop);
    expect(flop.collectors!.sold).toBeLessThan(CE_RUN.large * 0.5);
  });

});
