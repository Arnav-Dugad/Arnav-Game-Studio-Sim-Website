import { describe, expect, it } from 'vitest';
import { createScenarioGame } from '@/sim/scenarioSetup';
import { SCENARIOS } from '@/sim/systems/scenarios';
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
    for (let i = 0; i < 40 && s.status === 'running'; i++) advance(s, 1);
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
});
