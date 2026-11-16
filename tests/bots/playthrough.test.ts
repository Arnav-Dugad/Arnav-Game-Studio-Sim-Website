/**
 * Headless bot playthroughs: 46 in-game years per strategy, multiple seeds.
 * Checks the economy stays sane (no runaway money, no NaN, no negative stock), the fail state is real,
 * and that sensible play is viable.
 */
import { describe, expect, it } from 'vitest';
import { toDay } from '../../src/sim/calendar';
import { runBot, type BotRun } from './run';
import type { BotName } from './bots';

const SEEDS = [1000, 8919, 16838];
const cache = new Map<string, BotRun>();
const run = (bot: BotName, seed: number) => {
  const k = `${bot}:${seed}`;
  if (!cache.has(k)) cache.set(k, runBot(bot, seed, 46));
  return cache.get(k)!;
};

describe.each(['idle', 'steady', 'aggressive', 'trend', 'random', 'tycoon'] as BotName[])('%s bot', (bot) => {
  it.each(SEEDS)('seed %i keeps every invariant for 46 years', (seed) => {
    const r = run(bot, seed);
    expect(r.errors).toEqual([]);
    expect(Number.isFinite(r.state.company.cash)).toBe(true);
  });
});

describe('economy outcomes', () => {
  it('doing nothing leads to bankruptcy within a few years (fail state is real)', () => {
    for (const seed of SEEDS) {
      const r = run('idle', seed);
      expect(r.state.status).toBe('bankrupt');
      expect(r.state.day).toBeLessThan(toDay(1986, 1, 1));
    }
  });
  it('sensible strategies can build a lasting studio', () => {
    const survivors = (['steady', 'trend', 'tycoon'] as BotName[]).flatMap((b) => SEEDS.map((s) => run(b, s))).filter((r) => r.endYear >= 2020);
    expect(survivors.length).toBeGreaterThanOrEqual(3);
  });
  it('successful studios grow beyond the garage and make hits', () => {
    const best = SEEDS.map((s) => run('tycoon', s)).sort((a, b) => b.state.progress.stats.peakValuation - a.state.progress.stats.peakValuation)[0]!;
    expect(best.state.office.tier).toBeGreaterThanOrEqual(4);
    expect(best.state.progress.stats.bestScore).toBeGreaterThanOrEqual(80);
    expect(best.state.progress.stats.peakValuation).toBeGreaterThan(50_000_000);
  });
  it('random play never breaks the simulation', () => {
    for (const seed of SEEDS) expect(run('random', seed).errors).toEqual([]);
  });
});
