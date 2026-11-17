/** Storefront sale economics: extra copies and money from 25/50/75% off on a two-year-old game. */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import { saleForecast, type SaleDiscount } from '../../src/sim/systems/release';
import type { GameState } from '../../src/sim/types';

function build(seed: number): GameState {
  const s = createGame({ seed, companyName: 'X', founderName: 'F', startYear: 2010, autopause: false });
  s.research.done.push('biz_self_publishing');
  s.company.cash = 50_000_000;
  for (const k of Object.keys(s.staff.founder!.skills)) (s.staff.founder!.skills as Record<string, number>)[k] = 95;
  const plat = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
  dispatch(s, { type: 'startGame', game: { name: 'G', genre: 'rpg', topic: 'fantasy', platforms: [plat], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
  for (let i = 0; i < 300 && !s.releaseOrder.length; i++) {
    advance(s, 1);
    for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
    s.pendingEvents = [];
  }
  advance(s, 730);
  return s;
}
for (const seed of [1, 2, 3]) {
  const line: string[] = [];
  for (const d of [0, 0.25, 0.5, 0.75] as const) {
    const s = build(seed);
    const r = s.releases[s.releaseOrder[0]!]!;
    const u0 = r.units;
    const n0 = r.net;
    const fc = d ? saleForecast(s, r, d as SaleDiscount) : 0;
    if (d) dispatch(s, { type: 'runSale', releaseId: r.id, discount: d as SaleDiscount });
    advance(s, 56);
    line.push(`${d * 100}%: +${r.units - u0} (fc ${Math.round(fc)}) +$${Math.round((r.net - n0) / 1e3)}k`);
    if (!d) line.unshift(`score ${r.score} lifetime ${u0}`);
  }
  console.log(`seed ${seed}: ${line.join(' | ')}`);
}
