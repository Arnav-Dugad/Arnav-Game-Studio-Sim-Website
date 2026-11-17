/** Where a bot's money came from over a full run: lifetime income and expense by ledger category. */
import { runBot } from '../../tests/bots/run';
import type { BotName } from '../../tests/bots/bots';

const [bot = 'random', seedArg = '8919'] = process.argv.slice(2);
const r = runBot(bot as BotName, Number(seedArg), 46);
const inc: Record<string, number> = {};
const exp: Record<string, number> = {};
for (const m of r.state.finance.ledger) {
  for (const [k, v] of Object.entries(m.income)) inc[k] = (inc[k] ?? 0) + (v ?? 0);
  for (const [k, v] of Object.entries(m.expense)) exp[k] = (exp[k] ?? 0) + (v ?? 0);
}
const M = (v: number) => `${(v / 1e6).toFixed(1)}M`;
console.log(`${bot} ${seedArg}: ended ${r.endYear}, cash ${M(r.state.company.cash)}, ledger months ${r.state.finance.ledger.length}`);
console.log('income ', Object.entries(inc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${M(v)}`).join(' | '));
console.log('expense', Object.entries(exp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${M(v)}`).join(' | '));
const s = r.state;
console.log('leagues', (s.leagues ?? []).map((l) => `${l.name} ${l.tier} rev ${M(l.revenue)} cost ${M(l.costs)}`).join('; ') || 'none');
console.log('expansions', Object.values(s.releases).filter((x) => x.concept.expansionOf).map((x) => `${x.name} ${x.units} net ${M(x.net)}`).join('; ') || 'none');
console.log('sales run', Object.values(s.releases).reduce((t, x) => t + (x.saleCount ?? 0), 0), 'cheats used', !!s.cheatsUsed);
const top = Object.values(s.releases).sort((a, b) => b.net - a.net).slice(0, 5);
console.log('top games', top.map((x) => `${x.name} (${x.score}, ${x.concept.size}) ${M(x.net)}`).join(' | '));
