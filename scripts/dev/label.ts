/** Probe: return on publishing-label deals by tier and era. */
import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { dispatch } from '../../src/sim/actions';
import { signableIndies } from '../../src/sim/systems/publishing';
import { fmtMoney } from '../../src/sim/util';

for (const year of [1990, 2005, 2020]) {
  for (const tier of ['small', 'medium', 'large'] as const) {
    let paid = 0;
    let earned = 0;
    const scores: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame({ seed, companyName: 'Label', founderName: 'L', startYear: year, autopause: false });
      s.research.done.push('biz_self_publishing');
      s.company.reputation = 60;
      s.company.cash = 1e9;
      advance(s, 40);
      const indie = signableIndies(s)[seed % Math.max(1, signableIndies(s).length)];
      if (!indie) continue;
      const r = dispatch(s, { type: 'signIndie', rivalId: indie.id, tier });
      if (!r.ok) continue;
      for (let m = 0; m < 24; m++) {
        advance(s, 31);
        s.company.cash = 1e9;
        s.pendingEvents = [];
      }
      const d = s.publishingDeals![0]!;
      paid += d.advance;
      earned += d.earned;
      scores.push(d.score ?? 0);
    }
    console.log(year, tier, 'ROI', (earned / Math.max(1, paid)).toFixed(2), 'paid', fmtMoney(paid / scores.length), 'scores', scores.join(','));
  }
}
