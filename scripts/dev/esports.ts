/** Esports league economics: viewers, profit and prestige by tier and game size over four years. */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { availablePlatforms } from '../../src/sim/systems/market';
import type { LeagueTier } from '../../src/sim/types';

const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;
for (const units of [1e6, 5e6, 20e6]) {
  for (const tier of ['regional', 'pro', 'world'] as LeagueTier[]) {
    const s = createGame({ seed: 4, companyName: 'X', founderName: 'F', startYear: 2012, autopause: false });
    s.research.done.push('biz_self_publishing', 'biz_esports');
    s.company.cash = 1e9;
    s.company.reputation = 70;
    for (const k of Object.keys(s.staff.founder!.skills)) (s.staff.founder!.skills as Record<string, number>)[k] = 95;
    const plat = availablePlatforms(s).find((p) => p.kind === 'computer')!.id;
    dispatch(s, { type: 'startGame', game: { name: 'Arena', genre: 'shooter', topic: 'scifi', platforms: [plat], audience: 'teen', size: 'small', monetization: 'premium', engineId: 'e0', team: ['founder'] } });
    for (let i = 0; i < 300 && !s.releaseOrder.length; i++) {
      advance(s, 1);
      for (const p of Object.values(s.projects)) if (p.kind === 'game' && p.awaitingGate) dispatch(s, { type: 'continueGate', projectId: p.id });
      s.pendingEvents = [];
    }
    const r = s.releases[s.releaseOrder[0]!]!;
    r.score = 85;
    r.platforms[0]!.units = units;
    r.units = units;
    const res = dispatch(s, { type: 'foundLeague', releaseId: r.id, tier, name: 'League' });
    if (!res.ok) {
      console.log(tier, res.error);
      continue;
    }
    const lg = s.leagues![0]!;
    const row: string[] = [];
    for (let y = 1; y <= 4; y++) {
      const r0 = lg.revenue;
      const c0 = lg.costs;
      advance(s, 365);
      s.pendingEvents = [];
      row.push(`y${y}: ${Math.round(lg.viewers / 1e3)}k viewers, profit ${M(lg.revenue - r0 - (lg.costs - c0))}, prestige ${Math.round(lg.prestige)}`);
    }
    console.log(`${M(units)} units ${tier.padEnd(8)} | ${row.join(' | ')}`);
  }
}
