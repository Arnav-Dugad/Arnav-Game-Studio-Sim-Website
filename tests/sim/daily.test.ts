import { describe, expect, it } from 'vitest';
import { dailyLabel, dailyPick, todayKey } from '../../src/ui/game/daily';
import { SCENARIO_BY_ID } from '../../src/sim/systems/scenarios';
import { createScenarioGame } from '../../src/sim/scenarioSetup';
import { advance } from '../../src/sim/advance';

describe('daily challenge', () => {
  it('is the same for everyone on a day, and different on other days', () => {
    const a = dailyPick('2026-11-18');
    expect(dailyPick('2026-11-18')).toEqual(a);
    expect(SCENARIO_BY_ID[a.scenario]).toBeDefined();
    const days = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map((k) => dailyPick(k).seed);
    expect(new Set([a.seed, ...days]).size).toBe(5);
    expect(todayKey(new Date(2026, 10, 18))).toBe('2026-11-18');
    expect(dailyLabel('2026-11-18')).toMatch(/18/);
  });

  it('two players founding today get the same world', () => {
    const { scenario, seed } = dailyPick('2026-11-18');
    const opts = { seed, founderName: 'X', difficulty: 'standard' as const, founderFocus: 'balanced' as const, autopause: false, scenario };
    const a = createScenarioGame({ ...opts, companyName: 'Alpha' });
    const b = createScenarioGame({ ...opts, companyName: 'Beta' });
    advance(a, 120);
    advance(b, 120);
    expect(a.candidates.map((c) => c.name)).toEqual(b.candidates.map((c) => c.name));
    expect(a.rivalGames.map((g) => g.name)).toEqual(b.rivalGames.map((g) => g.name));
  });
});
