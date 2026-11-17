import { describe, expect, it } from 'vitest';
import { createGame } from '@/sim/create';
import { dispatch } from '@/sim/actions';
import { Rng } from '@/sim/rng';
import type { Ctx } from '@/sim/ctx';
import { BEST_FRIENDS, pairKey, relationMorale, relationsWeekly, teamChemistry } from '@/sim/systems/relations';
import { teamSynergy } from '@/sim/systems/dev';
import { availablePlatforms } from '@/sim/systems/market';
import { moraleTarget } from '@/sim/systems/staff';

function withTeam() {
  const s = createGame({ seed: 21, companyName: 'Rel', founderName: 'F', startYear: 1990, endless: true, autopause: false, difficulty: 'standard' });
  s.company.cash = 5_000_000;
  for (let i = 0; i < 3; i++) dispatch(s, { type: 'cheat', cheat: { op: 'spawnStaff', role: 'programmer', skill: 40, salary: 30_000 } });
  const team = Object.values(s.staff).filter((x) => x.role !== 'founder').map((x) => x.id);
  for (const id of team) s.staff[id]!.traits = [];
  const pl = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
  const r = dispatch(s, { type: 'startGame', game: { name: 'Pals', genre: 'puzzle', topic: 'fantasy', platforms: [pl], audience: 'everyone', size: 'small', monetization: 'premium', engineId: 'e0', team } });
  expect(r.ok).toBe(true);
  return { s, team };
}

describe('relationships', () => {
  it('teammates grow closer over time and chemistry lifts synergy', () => {
    const { s, team } = withTeam();
    const c: Ctx = { s, rng: new Rng(s.rng), out: [] };
    const staff = team.map((id) => s.staff[id]!);
    const before = teamSynergy(s, staff).total;
    for (let w = 0; w < 80; w++) relationsWeekly(c);
    expect(teamChemistry(s, staff).avg).toBeGreaterThan(20);
    expect(teamSynergy(s, staff).total).toBeGreaterThan(before);
  });

  it('a best friend on the team helps morale; a feud hurts', () => {
    const { s, team } = withTeam();
    const [a, b] = team as [string, string];
    s.relations = { [pairKey(a, b)]: BEST_FRIENDS + 5 };
    expect(relationMorale(s, s.staff[a]!).some((r) => r.v > 0)).toBe(true);
    const happy = moraleTarget(s, s.staff[a]!).total;
    s.relations = { [pairKey(a, b)]: -70 };
    expect(moraleTarget(s, s.staff[a]!).total).toBeLessThan(happy);
  });

  it('relationships with people who left are pruned', () => {
    const { s, team } = withTeam();
    s.relations = { [pairKey(team[0]!, 'ghost')]: 50 };
    relationsWeekly({ s, rng: new Rng(s.rng), out: [] });
    expect(s.relations[pairKey(team[0]!, 'ghost')]).toBeUndefined();
  });
});
