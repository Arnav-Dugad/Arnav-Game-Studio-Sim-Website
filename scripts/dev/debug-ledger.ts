import { runBot } from '../../tests/bots/run';
import { fmtMoney } from '../../src/sim/util';
import { formatDate } from '../../src/sim/calendar';
const r = runBot((process.argv[2] ?? 'steady') as never, Number(process.argv[3] ?? 8919), Number(process.argv[4] ?? 5));
const s = r.state;
for (const m of s.finance.ledger.slice(-Number(process.argv[5] ?? 18))) {
  const inc = Object.entries(m.income).map(([k, v]) => `${k}:${fmtMoney(v!)}`).join(' ');
  const exp = Object.entries(m.expense).map(([k, v]) => `${k}:${fmtMoney(v!)}`).join(' ');
  console.log(formatDate(m.day, false), 'cash', fmtMoney(m.cashEnd), '| IN', inc, '| OUT', exp);
}
for (const id of s.releaseOrder.slice(-6)) { const x = s.releases[id]!; console.log(formatDate(x.day), x.concept.size, x.concept.platforms.join('+'), x.score, x.units, fmtMoney(x.net), 'deal', !!x.concept.deal); }
console.log(s.status, s.endReason, 'staff', Object.values(s.staff).map(x=>x.role+':'+Math.round(x.salary/1000)+'k').join(' '));
