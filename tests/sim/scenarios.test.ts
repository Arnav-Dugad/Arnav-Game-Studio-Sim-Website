import { describe, expect, it } from 'vitest';
import { createScenarioGame } from '@/sim/scenarioSetup';
import { SCENARIOS, goalProgress } from '@/sim/systems/scenarios';
import { advance } from '@/sim/advance';
import { dispatch } from '@/sim/actions';
import { fromDay } from '@/sim/calendar';
import { stateHash } from '@/sim/save';
import { tierDef } from '@/sim/systems/office';

const make = (id: string, seed = 7) => createScenarioGame({ seed, companyName: 'Scen', founderName: 'F', scenario: id, autopause: false });

describe('scenarios', () => {
  it('every scenario sets up as described, deterministically, without being marked cheated', () => {
    for (const sc of SCENARIOS) {
      const s = make(sc.id);
      expect(fromDay(s.day).year).toBe(sc.year);
      expect(s.office.tier).toBe(sc.tier ?? 1);
      expect(Object.keys(s.staff).length).toBe(1 + (sc.hires ?? 0));
      expect(Object.keys(s.staff).length).toBeLessThanOrEqual(tierDef(s.office.tier).staffCap);
      expect(Object.values(s.staff).every((x) => x.deskId)).toBe(true);
      expect(s.cheatsUsed).toBeFalsy();
      expect(s.cheats?.freeBuild).toBeFalsy();
      expect(s.scenario?.id).toBe(sc.id);
      if (sc.home) expect(s.company.homeRegion).toBe(sc.home);
      expect(stateHash(make(sc.id))).toBe(stateHash(s));
    }
  });

  it('meeting every goal wins, and you can keep playing', () => {
    const s = make('garage');
    s.company.cash = 10_000_000;
    s.scenario!.met[0] = s.day; // pretend three games shipped
    s.pendingEvents = [];
    s.cheats = { noEvents: true };
    // monthly check runs on the 1st
    // money goals must hold for three monthly checks
    for (let i = 0; i < 130 && s.status === 'running'; i++) advance(s, 1);
    expect(s.scenario?.result).toBe('won');
    expect(s.status).toBe('retired');
    expect(dispatch(s, { type: 'continueEndless' }).ok).toBe(true);
    expect(s.status).toBe('running');
  });

  it('the deadline fails a scenario with goals left', () => {
    const s = make('crash');
    s.cheats = { noEvents: true, noBankruptcy: true };
    s.day = s.scenario!.deadlineDay - 2;
    advance(s, 5);
    expect(s.scenario?.result).toBe('failed');
  });

  it('the newer goal kinds measure the right things', () => {
    const s = make('mogul');
    const goals = [
      { kind: 'crowdfunded', amount: 1_000_000 },
      { kind: 'seriesFans', fans: 2_000_000 },
      { kind: 'mediaHits', n: 3 },
      { kind: 'classics', n: 2 },
      { kind: 'eaHit', score: 85 },
    ] as const;
    for (const g of goals) expect(goalProgress(s, g).p).toBe(0);
    s.progress.stats.crowdfunded = 1_200_000;
    s.progress.stats.classics = 2;
    s.franchises['f'] = { id: 'f', name: 'F', genre: 'action', topic: 'space', fans: 2_500_000, entries: [], fatigue: 0, lastDay: s.day, bestScore: 80 };
    s.mediaDeals = [0, 1, 2].map((i) => ({ id: `m${i}`, franchiseId: 'f', name: 'F', kind: 'comic' as const, control: 'licensed' as const, startDay: 0, releaseDay: 0, fee: 1, outcome: 'hit' as const }));
    for (const g of goals.slice(0, 4)) expect(goalProgress(s, g).p).toBeGreaterThanOrEqual(1);
  });
});
