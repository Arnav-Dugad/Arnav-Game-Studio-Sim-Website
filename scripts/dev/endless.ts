import { runBot } from '../../tests/bots/run';
import { fmtMoney } from '../../src/sim/util';
const r = runBot('steady', 4242, 62);
const s = r.state;
console.log('end', r.endYear, s.status, fmtMoney(s.company.cash), 'errors', r.errors.slice(0, 3));
console.log('future', s.market.futurePlatforms.map((f) => `${f.name}@${Math.round(f.launchDay / 365.25 + 1980)}`).join(', '));
const last = s.releaseOrder.slice(-3).map((id) => s.releases[id]!);
for (const x of last) console.log(x.name, x.concept.platforms.join('+'), x.score, x.units);
