/** Expansion pack economics: base game vs. its expansion, and the base game's revival. */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { GameState } from '../../src/sim/types';

function runUntilIdle(s: GameState) {
  for (let i = 0; i < 400 && Object.keys(s.projects).length; i++) {
    advance(s, 1);
    for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
    s.pendingEvents = [];
  }
}
const k = (v: number) => `${Math.round(v / 1e3)}k`;
for (const seed of [1, 2, 3, 4]) {
  const s = createGame({ seed, companyName: 'X', founderName: 'F', startYear: 1995, autopause: false });
  s.research.done.push('biz_self_publishing');
  s.company.cash = 50_000_000;
  for (const k of Object.keys(s.staff.founder!.skills)) (s.staff.founder!.skills as Record<string, number>)[k] = 95;
  const plat = availablePlatforms(s).filter((p) => p.media !== 'cartridge').sort((a, b) => (s.market.users[b.id] ?? 0) - (s.market.users[a.id] ?? 0))[0]!.id;
  const g = { name: 'Base', genre: 'rpg' as const, topic: 'fantasy', platforms: [plat], audience: 'teen' as const, size: 'small' as const, monetization: 'premium' as const, engineId: 'e0', team: ['founder'] };
  dispatch(s, { type: 'startGame', game: g });
  runUntilIdle(s);
  const base = s.releases[s.releaseOrder[0]!]!;
  advance(s, 300);
  base.score = Math.max(base.score, 75);
  const u0 = base.units;
  const r = dispatch(s, { type: 'startGame', game: { ...g, name: 'Exp', franchiseId: base.concept.franchiseId, expansionOf: base.id } });
  if (!r.ok) {
    console.log(seed, r.error);
    continue;
  }
  runUntilIdle(s);
  const exp = Object.values(s.releases).find((x) => x.concept.expansionOf)!;
  const u1 = base.units;
  advance(s, 365 * 2);
  console.log(
    `seed ${seed}: base ${base.score} sold ${u0} (net ${k(base.net)}, dev ${k(base.devCost)}) | exp ${exp.score} units ${exp.units} net ${k(exp.net)} price ${exp.price.toFixed(2)} vs ${base.price.toFixed(2)} dev ${k(exp.devCost)} | base revival +${base.units - u1}`,
  );
}
